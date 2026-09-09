import { createWorkflow, getBuiltInWorkflow, type TranslationLanguage, type Workflow } from '@nutrient-sdk/document-authoring-ai';

export const AI_USE_CASE_IDS = ['generic', 'proofreading', 'translation', 'template-fields'] as const;

export type AiUseCaseId = (typeof AI_USE_CASE_IDS)[number];

export const DEFAULT_TRANSLATION_TARGET_LANGUAGE: TranslationLanguage = 'spanish';

export const TRANSLATION_TARGET_LANGUAGES: readonly { id: TranslationLanguage; label: string }[] = [
	{ id: 'english', label: 'English' },
	{ id: 'german', label: 'German' },
	{ id: 'french', label: 'French' },
	{ id: 'spanish', label: 'Spanish' },
];

export const TEMPLATE_FIELD_CATALOG: readonly {
	id: string;
	label: string;
	fields: readonly { path: string; label: string; description: string }[];
}[] = [
	{
		id: 'client',
		label: 'Client',
		fields: [
			{ path: 'client.name', label: 'Client name', description: 'The legal name of the party receiving services.' },
			{ path: 'client.contactName', label: 'Client contact name', description: 'The person who receives notices.' },
			{ path: 'client.address', label: 'Client address', description: 'The client mailing address.' },
		],
	},
	{
		id: 'consultant',
		label: 'Consultant',
		fields: [
			{ path: 'consultant.name', label: 'Consultant name', description: 'The legal name of the party providing services.' },
			{ path: 'consultant.email', label: 'Consultant email', description: 'The email address for contract notices.' },
		],
	},
	{
		id: 'agreement',
		label: 'Agreement',
		fields: [
			{ path: 'agreement.effectiveDate', label: 'Effective date', description: 'The date when the agreement starts.' },
			{ path: 'agreement.fee', label: 'Fee', description: 'The total fixed amount payable.' },
			{ path: 'agreement.termMonths', label: 'Term length', description: 'The duration of the agreement.' },
		],
	},
	{
		id: 'owner',
		label: 'Owner',
		fields: [
			{ path: 'owner.fullName', label: 'Owner full name', description: 'The internal owner shown near the signature block.' },
			{ path: 'owner.title', label: 'Owner title', description: 'The job title of the internal owner.' },
		],
	},
];

const SELECTION_WORKFLOW = createWorkflow({
	name: 'selection_custom',
	systemPrompt: `You are editing only the content selected by the user.

Preserve useful structure and formatting. If the task needs content outside the selection, make no edits.`,
	defaultTask: 'Apply the user request to the selected content.',
});

const TEMPLATE_FIELDS_WORKFLOW = createWorkflow({
	name: 'template_fields',
	systemPrompt: `You are turning a completed contract into a reusable template.

Replace static values with placeholders exactly in the form {{field.path}} and only use the allowed fields below. Preserve the document structure, legal wording, punctuation, links, lists, tables, line breaks, and useful formatting. Do not invent fields, add clauses, remove clauses, summarize, or rewrite for style.

Allowed fields:
${TEMPLATE_FIELD_CATALOG.map(
	(group) => `- ${group.label}: ${group.fields.map((field) => `${field.label} => {{${field.path}}}`).join('; ')}`,
).join('\n')}`,
	defaultTask: 'Replace matching static contract values with the allowed reusable placeholders.',
});

export const normalizeAiUseCaseId = (value: unknown): AiUseCaseId =>
	AI_USE_CASE_IDS.includes(value as AiUseCaseId) ? (value as AiUseCaseId) : 'generic';

export const normalizeTranslationTargetLanguage = (value: unknown): TranslationLanguage =>
	TRANSLATION_TARGET_LANGUAGES.some(({ id }) => id === value) ? (value as TranslationLanguage) : DEFAULT_TRANSLATION_TARGET_LANGUAGE;

export const getAiUseCaseWorkflow = (
	useCaseId: AiUseCaseId,
	options: { translationTargetLanguage?: TranslationLanguage } = {},
): Workflow<string> => {
	switch (useCaseId) {
		case 'generic':
			return SELECTION_WORKFLOW;
		case 'proofreading':
			return getBuiltInWorkflow('proofreading');
		case 'translation':
			return getBuiltInWorkflow('translation', {
				targetLanguage: options.translationTargetLanguage ?? DEFAULT_TRANSLATION_TARGET_LANGUAGE,
			});
		case 'template-fields':
			return TEMPLATE_FIELDS_WORKFLOW;
	}
};

export type { TranslationLanguage };
