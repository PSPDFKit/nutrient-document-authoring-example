import './legal-assistant.css';

import {
	useEffect,
	useId,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	type PropsWithChildren,
	type ReactNode,
} from 'react';
import Markdown from 'react-markdown';
import { NutrientFrame, type NutrientFrameProps } from './NutrientFrame';

export type AssistantMessage = { id: string; role: 'user' | 'assistant'; text: string };
export type AssistantShellNavProps = Pick<
	NutrientFrameProps,
	'activeNavId' | 'activeExampleId' | 'onNavigate' | 'embedded' | 'showViewSource' | 'navigationDisabled'
>;

const Chevron = (props: { d: string }) => (
	<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
		<path d={props.d} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);

const DEFAULT_PANEL_WIDTH = 340;
const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_WIDTH = 640;
const MIN_EDITOR_WIDTH = 320;
const PANEL_RESIZE_STEP = 20;

const clampPanelWidth = (shell: HTMLDivElement, width: number) =>
	Math.min(Math.max(MIN_PANEL_WIDTH, width), Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, shell.clientWidth - MIN_EDITOR_WIDTH)));

export type AssistantShellProps = PropsWithChildren<
	AssistantShellNavProps & {
		title: string;
		description: string;
		open: boolean;
		onOpen: () => void;
		onClose: () => void;
		panel: ReactNode;
	}
>;

export const AssistantShell = (props: AssistantShellProps) => {
	const shellRef = useRef<HTMLDivElement>(null);
	const panelRef = useRef<HTMLElement>(null);
	const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
	const [panelWidth, setPanelWidth] = useState<number>();

	const resizePanel = (width: number) => {
		const shell = shellRef.current;
		if (shell) setPanelWidth(clampPanelWidth(shell, width));
	};

	const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		const panel = panelRef.current;
		if (!panel) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: panel.getBoundingClientRect().width };
	};

	const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		resizePanel(drag.startWidth + event.clientX - drag.startX);
	};

	const finishPointerResize = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (dragRef.current?.pointerId !== event.pointerId) return;
		dragRef.current = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
	};

	const handleResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		const panel = panelRef.current;
		const shell = shellRef.current;
		if (!panel || !shell) return;
		const currentWidth = panel.getBoundingClientRect().width;
		const maximumWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, shell.clientWidth - MIN_EDITOR_WIDTH));
		const nextWidth =
			event.key === 'ArrowLeft'
				? currentWidth - PANEL_RESIZE_STEP
				: event.key === 'ArrowRight'
					? currentWidth + PANEL_RESIZE_STEP
					: event.key === 'Home'
						? MIN_PANEL_WIDTH
						: event.key === 'End'
							? maximumWidth
							: undefined;
		if (nextWidth === undefined) return;
		event.preventDefault();
		resizePanel(nextWidth);
	};

	const shellStyle = panelWidth ? ({ '--assistant-panel-width': `${panelWidth}px` } as CSSProperties) : undefined;

	return (
		<NutrientFrame
			activeNavId={props.activeNavId}
			activeExampleId={props.activeExampleId}
			onNavigate={props.onNavigate}
			embedded={props.embedded}
			showViewSource={props.showViewSource}
			navigationDisabled={props.navigationDisabled}
		>
			<div ref={shellRef} className="legal-assistant-shell" style={shellStyle}>
				{props.open ? (
					<>
						<section ref={panelRef} className="legal-assistant-panel" aria-label={props.title}>
							<header className="legal-assistant-heading">
								<div>
									<h2>{props.title}</h2>
									<p>{props.description}</p>
								</div>
								<button
									type="button"
									className="legal-assistant-toggle"
									aria-label={`Close ${props.title}`}
									aria-expanded="true"
									title={`Close ${props.title}`}
									onClick={props.onClose}
								>
									<Chevron d="M10.5 3 5.5 8l5 5" />
								</button>
							</header>
							{props.panel}
						</section>
						<div
							className="assistant-resize-handle"
							role="separator"
							aria-label={`Resize ${props.title}`}
							aria-orientation="vertical"
							aria-valuemin={MIN_PANEL_WIDTH}
							aria-valuemax={MAX_PANEL_WIDTH}
							aria-valuenow={Math.round(panelWidth ?? DEFAULT_PANEL_WIDTH)}
							tabIndex={0}
							onKeyDown={handleResizeKeyDown}
							onPointerDown={handlePointerDown}
							onPointerMove={handlePointerMove}
							onPointerUp={finishPointerResize}
							onPointerCancel={finishPointerResize}
						/>
					</>
				) : (
					<div className="legal-assistant-rail">
						<button
							type="button"
							className="legal-assistant-toggle"
							aria-label={`Open ${props.title}`}
							aria-expanded="false"
							title={`Open ${props.title}`}
							onClick={props.onOpen}
						>
							<Chevron d="M5.5 3l5 5-5 5" />
						</button>
						<span className="legal-assistant-rail-label" aria-hidden="true">
							{props.title}
						</span>
					</div>
				)}
				<div className="legal-assistant-editor">{props.children}</div>
			</div>
		</NutrientFrame>
	);
};

export const DocumentReplaceDialog = (props: { open: boolean; onConfirm: () => void; onCancel: () => void }) => {
	const titleId = useId();
	const descriptionId = useId();
	const dialogRef = useRef<HTMLElement>(null);
	const cancelRef = useRef<HTMLButtonElement>(null);
	const onCancelRef = useRef(props.onCancel);
	onCancelRef.current = props.onCancel;

	useEffect(() => {
		if (!props.open) return;
		const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		cancelRef.current?.focus();
		const keepFocusInDialog = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onCancelRef.current();
				return;
			}
			if (event.key !== 'Tab') return;
			const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []);
			if (!buttons.length) return;
			const first = buttons[0];
			const last = buttons[buttons.length - 1];
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		};
		window.addEventListener('keydown', keepFocusInDialog);
		return () => {
			window.removeEventListener('keydown', keepFocusInDialog);
			previousFocus?.focus();
		};
	}, [props.open]);

	if (!props.open) return null;

	return (
		<div className="document-replace-backdrop">
			<section
				ref={dialogRef}
				role="alertdialog"
				aria-modal="true"
				aria-labelledby={titleId}
				aria-describedby={descriptionId}
				className="document-replace-dialog"
			>
				<h2 id={titleId}>Replace this edited document?</h2>
				<p id={descriptionId}>Your edits and assistant conversation will be discarded if you continue.</p>
				<div className="document-replace-actions">
					<button ref={cancelRef} type="button" onClick={props.onCancel}>
						Keep working
					</button>
					<button type="button" className="document-replace-confirm" onClick={props.onConfirm}>
						Replace document
					</button>
				</div>
			</section>
		</div>
	);
};

export const AssistantStatus = (props: { busy: boolean; busyText?: string; errorText?: string; statusText?: string }) => (
	<>
		{props.errorText ? (
			<p className="legal-assistant-error" role="alert">
				{props.errorText}
			</p>
		) : null}
		{props.busy ? (
			<p className="legal-assistant-busy" role="status">
				{props.busyText ?? 'Working on your request…'}
			</p>
		) : props.statusText ? (
			<p className="legal-assistant-busy" role="status">
				{props.statusText}
			</p>
		) : null}
	</>
);

export type AiAssistantPanelProps = {
	messages: readonly AssistantMessage[];
	input: string;
	onInputChange: (value: string) => void;
	reviewComments: boolean;
	onReviewCommentsChange: (enabled: boolean) => void;
	onSubmit: () => void;
	onApplySelection?: () => void;
	busy: boolean;
	busyText?: string;
	errorText?: string;
	selectionScope?: string;
	placeholder?: string;
};

const AssistantMarkdown = ({ text }: { text: string }) => (
	<div className="legal-assistant-markdown">
		<Markdown
			skipHtml
			components={{
				a({ href, children }) {
					return (
						<a href={href} target="_blank" rel="noreferrer">
							{children}
						</a>
					);
				},
			}}
		>
			{text}
		</Markdown>
	</div>
);

export const AiAssistantPanel = (props: AiAssistantPanelProps) => {
	const feedRef = useRef<HTMLDivElement>(null);
	const inputId = useId();
	useEffect(() => {
		const feed = feedRef.current;
		if (feed) feed.scrollTop = feed.scrollHeight;
	}, [props.messages, props.busy]);

	return (
		<>
			<div ref={feedRef} className="legal-assistant-feed" role="log" aria-label="Conversation">
				{props.messages.map((message) => (
					<article key={message.id} className={`legal-assistant-bubble legal-assistant-bubble-${message.role}`}>
						<strong>{message.role === 'user' ? 'You' : 'Assistant'}</strong>
						{message.role === 'assistant' ? <AssistantMarkdown text={message.text} /> : <p>{message.text}</p>}
					</article>
				))}
				{props.busy ? (
					<p className="legal-assistant-busy" role="status">
						{props.busyText ?? 'Working on your request…'}
					</p>
				) : null}
			</div>
			<form
				className="legal-assistant-form"
				onSubmit={(event) => {
					event.preventDefault();
					props.onSubmit();
				}}
			>
				{props.errorText ? (
					<p className="legal-assistant-error" role="alert">
						{props.errorText}
					</p>
				) : null}
				{props.selectionScope ? <p className="assistant-scope">Scope: {props.selectionScope}</p> : null}
				<label htmlFor={inputId}>Ask assistant</label>
				<textarea
					id={inputId}
					name="ai-assistant-input"
					rows={3}
					value={props.input}
					disabled={props.busy}
					placeholder={props.placeholder ?? 'What do you want to do with this document?'}
					onChange={(event) => props.onInputChange(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter' && !event.shiftKey) {
							event.preventDefault();
							event.currentTarget.form?.requestSubmit();
						}
					}}
				/>
				<div className="legal-assistant-form-actions">
					<label className="legal-assistant-option">
						<input
							type="checkbox"
							checked={props.reviewComments}
							disabled={props.busy}
							onChange={(event) => props.onReviewCommentsChange(event.target.checked)}
						/>
						<span>Add notes explaining AI edits</span>
					</label>
					<div className="legal-assistant-form-buttons">
						<button type="submit" disabled={props.busy || !props.input.trim()}>
							{props.busy ? 'Submitting…' : props.onApplySelection ? 'Ask' : 'Submit'}
						</button>
						{props.onApplySelection ? (
							<button type="button" disabled={props.busy || !props.input.trim()} onClick={props.onApplySelection}>
								Apply to selection
							</button>
						) : null}
					</div>
				</div>
			</form>
		</>
	);
};
