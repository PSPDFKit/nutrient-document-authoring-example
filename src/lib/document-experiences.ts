import type { DocAuthDocument, DocAuthEditorMode, DocAuthSystem } from '@nutrient-sdk/document-authoring';

import legalAssistantUrl from '../samples/sample.docx?url';
import proofreadingUrl from '../samples/proofreading-sample.docx?url';
import templateBuilderUrl from '../samples/template-fields-contract-sample.txt?url';
import translationUrl from '../samples/translation-sample.docx?url';

export type DocumentExperienceId = 'legal-assistant' | 'proofreading' | 'translation' | 'template-builder' | 'invoice' | 'blank' | 'upload';

export type AssistantPanelKind = 'legal' | 'proofreading' | 'translation' | 'template-builder' | 'generic';

export type DocumentExperience = {
	id: DocumentExperienceId;
	label: string;
	path: string;
	panel: AssistantPanelKind;
	defaultEditorMode: DocAuthEditorMode;
	assistantInitiallyOpen: boolean;
	loadDocument: (system: DocAuthSystem) => Promise<DocAuthDocument>;
};

const importDocx = (url: string, fileName: string) => (system: DocAuthSystem) => system.import(fetch(url), { fileName });

const createBlankDocument = (system: DocAuthSystem) => system.createDocumentFromPlaintext('');

export const DOCUMENT_EXPERIENCES: readonly DocumentExperience[] = [
	{
		id: 'legal-assistant',
		label: 'Legal Assistant',
		path: '/examples/legal-assistant/',
		panel: 'legal',
		defaultEditorMode: 'review',
		assistantInitiallyOpen: true,
		loadDocument: importDocx(legalAssistantUrl, 'common-paper-mutual-nda.docx'),
	},
	{
		id: 'proofreading',
		label: 'Proofreading',
		path: '/examples/proofreading/',
		panel: 'proofreading',
		defaultEditorMode: 'edit',
		assistantInitiallyOpen: true,
		loadDocument: importDocx(proofreadingUrl, 'proofreading-sample.docx'),
	},
	{
		id: 'translation',
		label: 'Translation',
		path: '/examples/translation/',
		panel: 'translation',
		defaultEditorMode: 'edit',
		assistantInitiallyOpen: true,
		loadDocument: importDocx(translationUrl, 'translation-sample.docx'),
	},
	{
		id: 'template-builder',
		label: 'Template Builder',
		path: '/examples/template-builder/',
		panel: 'template-builder',
		defaultEditorMode: 'edit',
		assistantInitiallyOpen: true,
		loadDocument: async (system) => {
			const response = await fetch(templateBuilderUrl);
			if (!response.ok) throw new Error('Failed to load the Template Builder document.');
			return system.createDocumentFromPlaintext(await response.text(), { pageSize: 'Letter' });
		},
	},
	{
		id: 'invoice',
		label: 'Invoice',
		path: '/examples/invoice/',
		panel: 'generic',
		defaultEditorMode: 'edit',
		assistantInitiallyOpen: true,
		loadDocument: (system) => system.loadDocument(fetch('/sample.json')),
	},
	{
		id: 'blank',
		label: 'Blank Page',
		path: '/blank/',
		panel: 'generic',
		defaultEditorMode: 'edit',
		assistantInitiallyOpen: false,
		loadDocument: createBlankDocument,
	},
	{
		id: 'upload',
		label: 'Upload Document',
		path: '/upload/',
		panel: 'generic',
		defaultEditorMode: 'edit',
		assistantInitiallyOpen: false,
		loadDocument: createBlankDocument,
	},
];

export const EXAMPLE_EXPERIENCES = DOCUMENT_EXPERIENCES.filter(({ id }) => id !== 'blank' && id !== 'upload');

const experienceById = (id: DocumentExperienceId) => {
	const experience = DOCUMENT_EXPERIENCES.find((candidate) => candidate.id === id);
	if (!experience) throw new Error(`Unknown document experience: ${id}`);
	return experience;
};

const isDocumentExperienceId = (value: string | null): value is DocumentExperienceId =>
	DOCUMENT_EXPERIENCES.some((experience) => experience.id === value);

export type DemoLocation = {
	experience: DocumentExperience;
	embedded: boolean;
	showViewSource: boolean;
};

export const experienceFromPath = (path: string): DocumentExperience => {
	if (path === '/') return experienceById('legal-assistant');
	if (path === '/sample/' || path === '/sample') return experienceById('invoice');
	if (path === '/custom/' || path === '/custom') return experienceById('upload');
	return (
		DOCUMENT_EXPERIENCES.find((experience) => experience.path === path || experience.path.slice(0, -1) === path) ??
		experienceById('legal-assistant')
	);
};

/** Resolves both the established full-demo routes and the compact embed settings. */
export const demoLocationFromUrl = (url: Pick<Location, 'pathname' | 'search'>): DemoLocation => {
	const embedded = url.pathname === '/embed' || url.pathname.startsWith('/embed/');
	if (!embedded) {
		return { experience: experienceFromPath(url.pathname), embedded: false, showViewSource: true };
	}

	const requestedExperience = new URLSearchParams(url.search).get('experience');
	const fallbackExperience = url.pathname.startsWith('/embed/sample')
		? experienceById('invoice')
		: url.pathname.startsWith('/embed/custom')
			? experienceById('upload')
			: experienceById('blank');

	return {
		experience: isDocumentExperienceId(requestedExperience) ? experienceById(requestedExperience) : fallbackExperience,
		embedded: true,
		showViewSource: new URLSearchParams(url.search).get('viewSource') !== 'false',
	};
};
