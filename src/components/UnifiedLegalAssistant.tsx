import { useChat } from '@ai-sdk/react';
import { z } from 'zod';
import type { DocAuthEditor } from '@nutrient-sdk/document-authoring';
import {
	getAiToolDefinitions,
	isAiWriteToolName,
	parseAiToolCall,
	type WorkflowFragmentValidationError,
	type AiToolName,
	type AiValidationError,
} from '@nutrient-sdk/document-authoring-ai';
import { getAiToolkit, type AiToolkit } from '@nutrient-sdk/document-authoring-ai/editor';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from 'ai';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { AiAssistantPanel, AssistantShell, DocumentReplaceDialog, type AssistantMessage } from './AssistantShell';
import { DocAuth } from './DocAuth';
import { ProofreadingPanel, TemplateBuilderPanel, TranslationPanel } from './FocusedAssistantShells';
import { LegalAssistantPanel, type LegalAssistantShortcut } from './LegalAssistantShell';
import { Upload, type UploadResult } from './Upload';
import {
	DEFAULT_TRANSLATION_TARGET_LANGUAGE,
	TEMPLATE_FIELD_CATALOG,
	TRANSLATION_TARGET_LANGUAGES,
	getAiUseCaseWorkflow,
	normalizeTranslationTargetLanguage,
	type AiUseCaseId,
	type TranslationLanguage,
} from '../lib/ai-use-cases';
import { demoLocationFromUrl, experienceFromPath, type AssistantPanelKind, type DocumentExperience } from '../lib/document-experiences';

const AI_ASSISTANT_AUTHOR = 'AI Assistant';
/** Position of a history entry within this page load, stored in history.state. */
const HISTORY_INDEX_KEY = 'documentAuthoringDemoIndex';
type ReviewCommentsMode = 'disabled' | 'create';
type WorkflowCompletion = { title: string; dismissLabel: string };

const WORKFLOW_COMPLETIONS: Partial<Record<AiUseCaseId, WorkflowCompletion>> = {
	proofreading: { title: 'Review complete', dismissLabel: 'Dismiss grammar check confirmation' },
	translation: { title: 'Translation complete', dismissLabel: 'Dismiss translation confirmation' },
};

const isAiValidationError = (error: unknown): error is AiValidationError =>
	error instanceof Error && (error as { code?: unknown }).code === 'INVALID_TOOL_CALL';

const readableErrorMessage = (message: string) => {
	try {
		const parsed = JSON.parse(message) as { error?: string | { message?: unknown } };
		if (typeof parsed.error === 'string') return parsed.error;
		return typeof parsed.error?.message === 'string' ? parsed.error.message : message;
	} catch {
		return message;
	}
};

const getErrorMessage = (error: unknown) => {
	if (!(error instanceof Error)) return 'The request failed.';
	if (!isAiValidationError(error)) return readableErrorMessage(error.message);
	const cause =
		typeof error.details === 'object' && error.details !== null && 'cause' in error.details
			? (error.details as { cause?: unknown }).cause
			: undefined;
	return typeof cause === 'string' && cause ? `${error.message} Details: ${cause}` : error.message;
};

const getAiWriteMode = (editor: DocAuthEditor): 'apply' | 'track_changes' => {
	const editorMode = editor.getEditorMode();
	if (editorMode === 'view') throw new Error('Switch to Edit or Review mode before asking the assistant to change the document.');
	return editorMode === 'review' ? 'track_changes' : 'apply';
};

const selectionScopeText = (selection: string | null) => {
	if (!selection) return undefined;
	const compact = selection.replace(/\s+/g, ' ').trim();
	const preview = compact.length > 72 ? `${compact.slice(0, 69)}…` : compact;
	return `Selected content — “${preview}”`;
};

const historyIndexOf = (state: unknown): number | undefined => {
	const value = (state as Record<string, unknown> | null)?.[HISTORY_INDEX_KEY];
	return typeof value === 'number' ? value : undefined;
};

const PANEL_HEADINGS = {
	legal: { title: 'Legal Assistant', description: 'Review this Mutual NDA, flag open issues, and prepare focused edits for counsel.' },
	proofreading: {
		title: 'Proofreading Assistant',
		description: 'Check the whole document or current selection for spelling, grammar, and clarity issues.',
	},
	translation: {
		title: 'Translation Assistant',
		description: 'Translate the whole document or current selection while preserving its structure.',
	},
	'template-builder': {
		title: 'Template Builder',
		description: 'Turn the completed contract into a reusable template with catalog placeholders.',
	},
	generic: { title: 'AI Assistant', description: 'Ask a question about the open document or describe the change you want to make.' },
} satisfies Record<AssistantPanelKind, { title: string; description: string }>;

/** Text shown by the assistant panel for the current or last workflow. */
type WorkflowState = { action?: string; error?: string; status?: string; completion?: WorkflowCompletion };

/** A document switch that waits for the user to confirm discarding edits. `historyIndex` is set when Back or Forward triggered it. */
type PendingReplacement =
	| { kind: 'experience'; experience: DocumentExperience; historyIndex?: number }
	| { kind: 'upload'; upload: UploadResult };

export const UnifiedLegalAssistant = () => {
	const [initialLocation] = useState(() => demoLocationFromUrl(window.location));
	const editorRef = useRef<DocAuthEditor | null>(null);
	const toolkitRef = useRef<AiToolkit | null>(null);
	const loadEpochRef = useRef(0);
	const historyIndexRef = useRef(historyIndexOf(window.history.state) ?? 0);
	const ignoreNextPopRef = useRef(false);
	const lastSubmittedPromptRef = useRef('');
	// Read at request time so automatic follow-up requests after tool results keep the submitted mode.
	const reviewCommentsRef = useRef<ReviewCommentsMode>('disabled');
	const [chatTransport] = useState(
		() =>
			new DefaultChatTransport({
				api: '/api/chat',
				prepareSendMessagesRequest: ({ messages }) => ({ body: { messages, reviewComments: reviewCommentsRef.current } }),
			}),
	);

	const [experience, setExperience] = useState(initialLocation.experience);
	const [editor, setEditor] = useState<DocAuthEditor | null>(null);
	const [panelOpen, setPanelOpen] = useState(initialLocation.experience.assistantInitiallyOpen);
	const [input, setInput] = useState('');
	const [reviewComments, setReviewComments] = useState<ReviewCommentsMode>('disabled');
	const [selectionText, setSelectionText] = useState<string | null>(null);
	const [translationLanguage, setTranslationLanguage] = useState<TranslationLanguage>(DEFAULT_TRANSLATION_TARGET_LANGUAGE);
	const [translationInstructions, setTranslationInstructions] = useState('');
	const [workflowBusy, setWorkflowBusy] = useState(false);
	const [workflow, setWorkflow] = useState<WorkflowState>({});
	const [documentBusy, setDocumentBusy] = useState(false);
	const [documentError, setDocumentError] = useState<string | null>(null);
	const [uploadedDocumentReady, setUploadedDocumentReady] = useState(false);
	const [documentDirty, setDocumentDirty] = useState(false);
	const [pendingReplacement, setPendingReplacement] = useState<PendingReplacement | null>(null);

	const { messages, sendMessage, addToolOutput, status, error, clearError, setMessages, stop } = useChat({
		transport: chatTransport,
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
		async onToolCall({ toolCall }) {
			if ('dynamic' in toolCall && toolCall.dynamic) return;
			const toolName = toolCall.toolName as AiToolName;
			const fail = (errorText: string) =>
				addToolOutput({ tool: toolName, toolCallId: toolCall.toolCallId, state: 'output-error', errorText });
			const currentEditor = editorRef.current;
			const toolkit = toolkitRef.current;
			if (!currentEditor || !toolkit) {
				fail('Document editor is still loading. Please retry in a moment.');
				return;
			}
			try {
				const writesDocument = isAiWriteToolName(toolName);
				const writeMode = writesDocument
					? getAiWriteMode(currentEditor)
					: currentEditor.getEditorMode() === 'review'
						? 'track_changes'
						: 'apply';
				const activeReviewComments = reviewCommentsRef.current;
				const previousAuthor = currentEditor.getAuthor();
				if (writesDocument) currentEditor.setAuthor(AI_ASSISTANT_AUTHOR);
				try {
					const parsed = parseAiToolCall(
						{
							id: toolCall.toolCallId,
							name: toolCall.toolName,
							args:
								toolCall.input && typeof toolCall.input === 'object' && !Array.isArray(toolCall.input)
									? (toolCall.input as Record<string, unknown>)
									: {},
						},
						getAiToolDefinitions({ reviewComments: activeReviewComments }),
					);
					const output = await toolkit.executeTool(parsed, { writeMode, reviewComments: activeReviewComments });
					addToolOutput({ tool: parsed.name, toolCallId: toolCall.toolCallId, output });
				} finally {
					if (writesDocument) currentEditor.setAuthor(previousAuthor);
				}
			} catch (executionError) {
				fail(getErrorMessage(executionError));
			}
		},
	});

	useEffect(() => {
		if (historyIndexOf(window.history.state) !== undefined) return;
		window.history.replaceState({ ...window.history.state, [HISTORY_INDEX_KEY]: historyIndexRef.current }, '');
	}, []);

	useEffect(() => {
		if (status === 'ready' || status === 'error') setWorkflow((current) => (current.action ? { ...current, action: undefined } : current));
	}, [status]);

	useEffect(() => {
		if (!error || !lastSubmittedPromptRef.current) return;
		setInput((current) => current || lastSubmittedPromptRef.current);
	}, [error]);

	const handleEditorReady = useCallback(
		(readyEditor: DocAuthEditor) => {
			editorRef.current = readyEditor;
			toolkitRef.current = getAiToolkit(readyEditor);
			readyEditor.on('content.change', () => setDocumentDirty(true));
			readyEditor.on('document.load', () => setDocumentDirty(false));
			readyEditor.setEditorMode(initialLocation.experience.defaultEditorMode);
			setEditor(readyEditor);
			setDocumentDirty(false);
			setDocumentError(null);
		},
		[initialLocation],
	);

	useEffect(() => () => toolkitRef.current?.dispose(), []);

	useEffect(() => {
		if (!editor) return;
		const updateSelection = () => {
			try {
				setSelectionText(editor.getSelectionContent({ format: 'text' }));
			} catch {
				setSelectionText(null);
			}
		};
		updateSelection();
		editor.on('selection.change', updateSelection);
		editor.on('content.change', updateSelection);
		editor.on('document.load', updateSelection);
		return () => {
			editor.off('selection.change', updateSelection);
			editor.off('content.change', updateSelection);
			editor.off('document.load', updateSelection);
		};
	}, [editor]);

	const resetAssistant = () => {
		void stop();
		clearError();
		setMessages([]);
		setInput('');
		setSelectionText(null);
		setWorkflow({});
		setTranslationInstructions('');
		lastSubmittedPromptRef.current = '';
	};

	const navigationBlocked = !editor || documentBusy || workflowBusy || status === 'submitted' || status === 'streaming';

	/** Moves the browser back to the entry the app is showing after Back or Forward was refused. */
	const returnToCurrentHistoryEntry = (poppedIndex: number) => {
		const delta = historyIndexRef.current - poppedIndex;
		if (delta === 0) return;
		ignoreNextPopRef.current = true;
		window.history.go(delta);
	};

	/** Loads `next` into the existing editor. Pushes a history entry unless `historyIndex` names the entry already reached. */
	const performExperienceChange = (next: DocumentExperience, historyIndex?: number) => {
		if (!editor) return;
		setPendingReplacement(null);
		resetAssistant();
		setExperience(next);
		setPanelOpen(next.assistantInitiallyOpen);
		setUploadedDocumentReady(false);
		setDocumentDirty(false);
		setDocumentError(null);
		setDocumentBusy(true);
		if (historyIndex === undefined) {
			historyIndexRef.current += 1;
			window.history.pushState({ [HISTORY_INDEX_KEY]: historyIndexRef.current }, '', next.path);
		} else {
			historyIndexRef.current = historyIndex;
		}
		const epoch = ++loadEpochRef.current;
		void next
			.loadDocument(editor.docAuthSystem())
			.then((document) => {
				if (loadEpochRef.current !== epoch) return;
				setDocumentDirty(false);
				editor.setCurrentDocument(document);
				editor.setEditorMode(next.defaultEditorMode);
			})
			.catch((loadError) => {
				if (loadEpochRef.current === epoch) setDocumentError(getErrorMessage(loadError));
			})
			.finally(() => {
				if (loadEpochRef.current === epoch) setDocumentBusy(false);
			});
	};

	const performUploadImport = async (upload: UploadResult) => {
		const currentEditor = editorRef.current;
		if (!currentEditor) return;
		resetAssistant();
		setDocumentBusy(true);
		setDocumentError(null);
		try {
			const document = await currentEditor.docAuthSystem().import(new Uint8Array(upload.buffer), { fileName: upload.fileName });
			setDocumentDirty(false);
			currentEditor.setCurrentDocument(document);
			currentEditor.setEditorMode('edit');
			setUploadedDocumentReady(true);
			setPanelOpen(true);
		} catch (importError) {
			setDocumentError(getErrorMessage(importError));
		} finally {
			setDocumentBusy(false);
		}
	};

	/** Handles a navigation click (no `historyIndex`) or a Back/Forward traversal to the entry at `historyIndex`. */
	const changeExperience = (next: DocumentExperience, historyIndex?: number) => {
		if (next.id === experience.id) {
			if (historyIndex !== undefined) historyIndexRef.current = historyIndex;
			if (next.id === 'upload' && uploadedDocumentReady && !navigationBlocked) setUploadedDocumentReady(false);
			return;
		}
		if (navigationBlocked || documentDirty) {
			if (historyIndex !== undefined) returnToCurrentHistoryEntry(historyIndex);
			if (!navigationBlocked) setPendingReplacement({ kind: 'experience', experience: next, historyIndex });
			return;
		}
		performExperienceChange(next, historyIndex);
	};

	useEffect(() => {
		const onPopState = (event: PopStateEvent) => {
			if (ignoreNextPopRef.current) {
				ignoreNextPopRef.current = false;
				return;
			}
			changeExperience(demoLocationFromUrl(window.location).experience, historyIndexOf(event.state) ?? historyIndexRef.current);
		};
		window.addEventListener('popstate', onPopState);
		return () => window.removeEventListener('popstate', onPopState);
	});

	const confirmReplacement = () => {
		if (!pendingReplacement) return;
		if (pendingReplacement.kind === 'upload') {
			void performUploadImport(pendingReplacement.upload).finally(() => setPendingReplacement(null));
			return;
		}
		const { experience: next, historyIndex } = pendingReplacement;
		if (historyIndex !== undefined && historyIndex !== historyIndexRef.current) {
			// The refused traversal was undone when the dialog opened, so redo it silently.
			ignoreNextPopRef.current = true;
			window.history.go(historyIndex - historyIndexRef.current);
		}
		performExperienceChange(next, historyIndex);
	};

	const importUpload = async (upload: UploadResult) => {
		if (navigationBlocked || !editorRef.current) return;
		if (documentDirty) {
			setPendingReplacement({ kind: 'upload', upload });
			return;
		}
		await performUploadImport(upload);
	};

	const runWorkflow = async (useCase: AiUseCaseId, task: string, scope: 'document' | 'selection', action: string) => {
		const currentEditor = editorRef.current;
		const toolkit = toolkitRef.current;
		if (!currentEditor || !toolkit || workflowBusy) return false;
		setWorkflowBusy(true);
		setWorkflow({ action });
		try {
			const writeMode = getAiWriteMode(currentEditor);
			const workflowDefinition = getAiUseCaseWorkflow(useCase, { translationTargetLanguage: translationLanguage });
			const workflowInput = await toolkit.readWorkflowInput(workflowDefinition, { scope });
			if (writeMode === 'track_changes' && workflowInput.scope === 'document') {
				throw new Error('Select document content to use this workflow in Review mode, or switch to Edit mode.');
			}
			const requestOutput = async (retryFeedback?: { issues: WorkflowFragmentValidationError['issues'] }) => {
				const response = await fetch('/api/chat', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ useCase, translationTargetLanguage: translationLanguage, task, workflowInput, retryFeedback }),
				});
				const body = (await response.json().catch(() => null)) as { error?: unknown; output?: unknown } | null;
				if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Assistant workflow failed.');
				if (!body || !('output' in body)) throw new Error('Assistant workflow returned no document update.');
				return body.output;
			};
			const applyOutput = async (output: unknown) => {
				const previousAuthor = currentEditor.getAuthor();
				currentEditor.setAuthor(AI_ASSISTANT_AUTHOR);
				try {
					await toolkit.applyWorkflowOutput(workflowDefinition, output, { scope: workflowInput.scope, writeMode });
				} finally {
					currentEditor.setAuthor(previousAuthor);
				}
			};
			try {
				await applyOutput(await requestOutput());
			} catch (applyError) {
				// The model gets one more attempt with the validator's content-free issues.
				// Published entrypoints can contain distinct copies of the error class.
				const validationError = z
					.object({
						code: z.literal('INVALID_WORKFLOW_FRAGMENT'),
						issues: z.array(z.object({ path: z.string(), message: z.string() })),
					})
					.safeParse(applyError);
				if (!validationError.success) throw applyError;
				await applyOutput(await requestOutput({ issues: validationError.data.issues }));
			}
			const completion = WORKFLOW_COMPLETIONS[useCase];
			setWorkflow(completion ? { completion } : { status: 'The document update is ready in the editor.' });
			return true;
		} catch (runError) {
			setWorkflow({ error: getErrorMessage(runError) });
			return false;
		} finally {
			setWorkflowBusy(false);
		}
	};

	const submitPrompt = (rawPrompt: string, applyToSelection = false) => {
		const prompt = rawPrompt.trim();
		const currentEditor = editorRef.current;
		if (!prompt || !currentEditor || documentBusy || workflowBusy || status === 'submitted' || status === 'streaming') return;
		clearError();
		setWorkflow({});
		lastSubmittedPromptRef.current = prompt;
		setInput('');
		if (applyToSelection) {
			const userMessage: UIMessage = { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: prompt }] };
			setMessages((current) => [...current, userMessage]);
			void runWorkflow('generic', prompt, 'selection', 'Applying your request to the selected content…').then((applied) => {
				if (!applied) {
					setInput((current) => current || prompt);
					return;
				}
				const assistantMessage: UIMessage = {
					id: crypto.randomUUID(),
					role: 'assistant',
					parts: [{ type: 'text', text: 'Applied the requested change to the selected content.' }],
				};
				setMessages((current) => [...current, assistantMessage]);
			});
			return;
		}
		setWorkflow({ action: 'Answering your request…' });
		reviewCommentsRef.current = reviewComments;
		void sendMessage({ text: prompt });
	};

	const runFocusedWorkflow = () => {
		const currentEditor = editorRef.current;
		if (!currentEditor) return;
		const scope = currentEditor.getSelectionContent({ format: 'text' }) !== null ? 'selection' : 'document';
		if (experience.panel === 'proofreading') {
			void runWorkflow(
				'proofreading',
				getAiUseCaseWorkflow('proofreading').defaultTask,
				scope,
				`Proofreading the ${scope === 'selection' ? 'selected content' : 'document'}…`,
			);
		} else if (experience.panel === 'translation') {
			const workflowDefinition = getAiUseCaseWorkflow('translation', { translationTargetLanguage: translationLanguage });
			const task = translationInstructions.trim()
				? `${workflowDefinition.defaultTask}\n\nAdditional translation instructions: ${translationInstructions.trim()}`
				: workflowDefinition.defaultTask;
			const targetLabel = TRANSLATION_TARGET_LANGUAGES.find(({ id }) => id === translationLanguage)?.label ?? translationLanguage;
			void runWorkflow(
				'translation',
				task,
				scope,
				`Translating the ${scope === 'selection' ? 'selected content' : 'document'} into ${targetLabel}…`,
			);
		} else if (experience.panel === 'template-builder') {
			void runWorkflow(
				'template-fields',
				getAiUseCaseWorkflow('template-fields').defaultTask,
				'document',
				'Building reusable template fields…',
			);
		}
	};

	const conversation = messages.flatMap<AssistantMessage>((message) =>
		message.parts.flatMap((part, index) =>
			part.type === 'text' && part.text
				? [{ id: `${message.id}-${index}`, role: message.role === 'user' ? 'user' : 'assistant', text: part.text }]
				: [],
		),
	);
	const assistantBusy = documentBusy || workflowBusy || status === 'submitted' || status === 'streaming';
	const aiError = workflow.error ?? (error ? getErrorMessage(error) : undefined);
	const assistantError = documentError ?? aiError;
	const assistantBusyText = documentBusy ? `Loading ${experience.label}…` : workflow.action ?? 'Working on your request…';
	const scope = selectionScopeText(selectionText);

	let panel: ReactNode;
	switch (experience.panel) {
		case 'legal':
			panel = (
				<LegalAssistantPanel
					messages={conversation}
					input={input}
					onInputChange={setInput}
					reviewComments={reviewComments === 'create'}
					onReviewCommentsChange={(enabled) => setReviewComments(enabled ? 'create' : 'disabled')}
					onSubmit={() => submitPrompt(input)}
					onApplySelection={scope ? () => submitPrompt(input, true) : undefined}
					selectionScope={scope}
					onShortcut={(shortcut: LegalAssistantShortcut) => submitPrompt(shortcut.prompt)}
					busy={assistantBusy}
					busyText={assistantBusyText}
					errorText={assistantError}
				/>
			);
			break;
		case 'generic':
			panel = (
				<AiAssistantPanel
					messages={conversation}
					input={input}
					onInputChange={setInput}
					reviewComments={reviewComments === 'create'}
					onReviewCommentsChange={(enabled) => setReviewComments(enabled ? 'create' : 'disabled')}
					onSubmit={() => submitPrompt(input)}
					onApplySelection={scope ? () => submitPrompt(input, true) : undefined}
					busy={assistantBusy}
					busyText={assistantBusyText}
					errorText={assistantError}
					selectionScope={scope}
				/>
			);
			break;
		case 'proofreading':
			panel = (
				<ProofreadingPanel
					busy={assistantBusy}
					busyText={assistantBusyText}
					errorText={assistantError}
					statusText={workflow.status}
					selectionScope={scope}
					onReview={runFocusedWorkflow}
				/>
			);
			break;
		case 'translation':
			panel = (
				<TranslationPanel
					busy={assistantBusy}
					busyText={assistantBusyText}
					errorText={assistantError}
					statusText={workflow.status}
					selectionScope={scope}
					languageOptions={TRANSLATION_TARGET_LANGUAGES.map(({ id, label }) => ({ value: id, label }))}
					targetLanguage={translationLanguage}
					onTargetLanguageChange={(value) => setTranslationLanguage(normalizeTranslationTargetLanguage(value))}
					instructions={translationInstructions}
					onInstructionsChange={setTranslationInstructions}
					onTranslate={runFocusedWorkflow}
				/>
			);
			break;
		case 'template-builder':
			panel = (
				<TemplateBuilderPanel
					busy={assistantBusy}
					busyText={assistantBusyText}
					errorText={assistantError}
					statusText={workflow.status}
					onBuildTemplate={runFocusedWorkflow}
					placeholderGroups={TEMPLATE_FIELD_CATALOG.map((group) => ({
						heading: group.label,
						fields: group.fields.map((field) => ({
							id: field.path,
							label: `${field.label} — {{${field.path}}}`,
							description: field.description,
						})),
					}))}
				/>
			);
			break;
	}

	const heading = PANEL_HEADINGS[experience.panel];
	const activeNavId = experience.id === 'blank' ? 'blank' : experience.id === 'upload' ? 'upload' : 'examples';
	const handleNavigate = (target: { href: string }, event: React.MouseEvent<HTMLAnchorElement>) => {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		changeExperience(experienceFromPath(target.href));
	};

	return (
		<>
			<AssistantShell
				title={heading.title}
				description={heading.description}
				open={panelOpen}
				onOpen={() => setPanelOpen(true)}
				onClose={() => setPanelOpen(false)}
				activeNavId={activeNavId}
				activeExampleId={activeNavId === 'examples' ? experience.id : undefined}
				onNavigate={handleNavigate}
				embedded={initialLocation.embedded}
				showViewSource={initialLocation.showViewSource}
				navigationDisabled={navigationBlocked || pendingReplacement !== null}
				panel={panel}
			>
				<div className="document-experience-editor" data-document-dirty={documentDirty}>
					<DocAuth
						initialDocument={initialLocation.experience.loadDocument}
						onEditorReady={handleEditorReady}
						onImportError={(importError) => setDocumentError(getErrorMessage(importError))}
					/>
					{experience.id === 'upload' && !uploadedDocumentReady ? (
						<div className="document-experience-upload" aria-label="Upload a document">
							<Upload setUploadResult={(upload) => void importUpload(upload)} importError={documentError} />
						</div>
					) : null}
					{workflow.completion ? (
						<div className="workflow-completion-toast" role="status" aria-live="polite">
							<strong>{workflow.completion.title}</strong>
							<button
								type="button"
								aria-label={workflow.completion.dismissLabel}
								onClick={() => setWorkflow((current) => ({ ...current, completion: undefined }))}
							>
								Close
							</button>
						</div>
					) : null}
				</div>
			</AssistantShell>
			<DocumentReplaceDialog
				open={pendingReplacement !== null}
				onCancel={() => {
					if (pendingReplacement?.kind === 'upload') setUploadedDocumentReady(true);
					setPendingReplacement(null);
				}}
				onConfirm={confirmReplacement}
			/>
		</>
	);
};
