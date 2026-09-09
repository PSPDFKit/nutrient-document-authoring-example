import { expect, test } from '@playwright/test';

const uiMessageStreamBody = (chunks: readonly Record<string, unknown>[]) =>
	`${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}`).join('\n\n')}\n\ndata: [DONE]\n\n`;

const mockAssistant = async (
	page: import('@playwright/test').Page,
	options: { failFirstRequest?: boolean; failFirstWorkflow?: boolean; delayMs?: number } = {},
) => {
	const requests: Record<string, unknown>[] = [];
	await page.route('**/api/chat', async (route) => {
		const request = route.request().postDataJSON() as Record<string, unknown>;
		requests.push(request);
		if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
		if (options.failFirstRequest && requests.length === 1) {
			await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary failure.' }) });
			return;
		}
		if (request.workflowInput) {
			const workflowInput = request.workflowInput as {
				fragmentContract?: { contractVersion?: unknown; fragmentVersion?: unknown; jsonSchema?: unknown };
				inputFragment: unknown;
			};
			expect(workflowInput.fragmentContract).toMatchObject({
				contractVersion: 1,
				jsonSchema: expect.any(Object),
				fragmentVersion: expect.any(Number),
			});
			const inputFragment = workflowInput.inputFragment as { fragment: Record<string, unknown> };
			const replacementFragment =
				options.failFirstWorkflow && requests.filter((entry) => entry.workflowInput).length === 1
					? { ...inputFragment, fragment: { ...inputFragment.fragment, content: 'not a block list' } }
					: inputFragment;
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ output: { replacementFragment } }),
			});
			return;
		}
		await route.fulfill({
			status: 200,
			headers: {
				'content-type': 'text/event-stream',
				'x-vercel-ai-ui-message-stream': 'v1',
			},
			body: uiMessageStreamBody([
				{ type: 'start', messageId: `mock-assistant-${requests.length}` },
				{ type: 'text-start', id: 'answer' },
				{ type: 'text-delta', id: 'answer', delta: 'The assistant response is scoped to the active document.' },
				{ type: 'text-end', id: 'answer' },
				{ type: 'finish', finishReason: 'stop' },
			]),
		});
	});
	return requests;
};

const editDocument = async (page: import('@playwright/test').Page) => {
	const editorHost = page.getByTestId('document-editor-host');
	await expect(editorHost.locator('[data-region="body"]').first()).toBeAttached({ timeout: 60_000 });
	await editorHost.click({ position: { x: 250, y: 250 } });
	await page.keyboard.type(' Protected visitor edit');
	await expect(page.locator('.document-experience-editor')).toHaveAttribute('data-document-dirty', 'true');
};

const rememberEditorHost = async (page: import('@playwright/test').Page) => {
	const editorHost = page.getByTestId('document-editor-host');
	await expect(editorHost.locator('[data-region="body"]').first()).toBeAttached({ timeout: 60_000 });
	await editorHost.evaluate((element) => {
		(window as typeof window & { initialEditorHost?: Element }).initialEditorHost = element;
	});
	return editorHost;
};

const expectSameEditorHost = async (editorHost: import('@playwright/test').Locator) => {
	expect(
		await editorHost.evaluate((element) => element === (window as typeof window & { initialEditorHost?: Element }).initialEditorHost),
	).toBe(true);
};

test('Legal Assistant shares the main editable document lifecycle', async ({ page }) => {
	const requests: Record<string, unknown>[] = [];
	await page.route('**/api/chat', async (route) => {
		requests.push(route.request().postDataJSON() as Record<string, unknown>);
		await route.fulfill({
			status: 200,
			headers: {
				'content-type': 'text/event-stream',
				'x-vercel-ai-ui-message-stream': 'v1',
			},
			body: uiMessageStreamBody([
				{ type: 'start', messageId: `mock-assistant-${requests.length}` },
				{ type: 'text-start', id: 'answer' },
				{
					type: 'text-delta',
					id: 'answer',
					delta: 'The NDA has **open fields**:\n\n- Cover Page\n- Signature date\n\n[Review guidance](https://example.com)',
				},
				{ type: 'text-end', id: 'answer' },
				{ type: 'finish', finishReason: 'stop' },
			]),
		});
	});

	await page.goto('/');

	const editorHost = page.getByTestId('document-editor-host');
	await expect(editorHost.locator('[data-region="body"]').first()).toBeAttached({ timeout: 60_000 });
	await editorHost.evaluate((element) => {
		(window as typeof window & { initialEditorRoot?: Element | null }).initialEditorRoot = element.firstElementChild;
	});

	const panel = page.getByRole('region', { name: 'Legal Assistant' });
	await expect(page.getByRole('link', { name: 'View source' })).toHaveAttribute(
		'href',
		'https://github.com/PSPDFKit/nutrient-document-authoring-example',
	);
	await expect(panel).toBeVisible();
	await expect(panel.getByRole('button', { name: 'Find blanks to finish' })).toBeEnabled();
	await expect(panel.getByRole('button', { name: 'Fill effective date' })).toBeEnabled();
	await expect(panel.getByRole('textbox', { name: 'Ask assistant' })).toBeEnabled();
	const reviewComments = panel.getByRole('checkbox', { name: 'Add notes explaining AI edits' });
	await expect(reviewComments).not.toBeChecked();
	await expect(page.getByRole('button', { name: 'Editor mode' })).toHaveText('Review');
	expect(requests).toHaveLength(0);
	const resizeHandle = page.getByRole('separator', { name: 'Resize Legal Assistant' });
	const initialPanelWidth = (await panel.boundingBox())?.width;
	await resizeHandle.press('ArrowRight');
	await expect.poll(async () => (await panel.boundingBox())?.width).toBe((initialPanelWidth ?? 0) + 20);

	await page.getByRole('button', { name: 'Close Legal Assistant' }).click();
	await expect(panel).toBeHidden();
	await page.getByRole('button', { name: 'Open Legal Assistant' }).click();
	await expect(panel).toBeVisible();
	expect(requests).toHaveLength(0);
	expect(
		await editorHost.evaluate(
			(element) => element.firstElementChild === (window as typeof window & { initialEditorRoot?: Element | null }).initialEditorRoot,
		),
	).toBe(true);

	await reviewComments.check();
	await panel.getByRole('textbox', { name: 'Ask assistant' }).fill('Which fields are incomplete?');
	await panel.getByRole('button', { name: 'Submit' }).click();
	const assistantMarkdown = panel.locator('.legal-assistant-bubble-assistant .legal-assistant-markdown');
	await expect(assistantMarkdown.locator('strong')).toHaveText('open fields');
	await expect(assistantMarkdown.locator('li')).toHaveText(['Cover Page', 'Signature date']);
	await expect(assistantMarkdown.getByRole('link', { name: 'Review guidance' })).toHaveAttribute('target', '_blank');
	await expect(panel.getByRole('heading', { name: 'Ask about the draft' })).toBeHidden();
	await expect(panel.getByRole('heading', { name: 'Revise the draft' })).toBeHidden();
	expect(requests).toHaveLength(1);
	expect(requests[0]?.reviewComments).toBe('create');

	await page.reload();
	await expect(editorHost.locator('[data-region="body"]').first()).toBeAttached({ timeout: 60_000 });
	await panel.getByRole('button', { name: 'Fill effective date' }).click();
	await expect(panel.getByRole('heading', { name: 'Ask about the draft' })).toBeHidden();
	await expect(panel.getByRole('heading', { name: 'Revise the draft' })).toBeHidden();
	await expect(page.getByRole('button', { name: 'Editor mode' })).toHaveText('Review');
	expect(requests).toHaveLength(2);
});

test('Examples use stable routes, focused panels, and one editor lifecycle', async ({ page }) => {
	const requests = await mockAssistant(page, { delayMs: 150 });
	await page.goto('/');
	const editorHost = await rememberEditorHost(page);
	expect(requests).toHaveLength(0);
	const legalAssistant = page.getByRole('region', { name: 'Legal Assistant' });
	await legalAssistant.getByRole('textbox', { name: 'Ask assistant' }).fill('What should I review?');
	await legalAssistant.getByRole('button', { name: 'Submit' }).click();
	await expect(legalAssistant.getByRole('status')).toContainText('Answering your request');
	await expect(legalAssistant.getByText('The assistant response is scoped to the active document.')).toBeVisible();
	expect(requests).toHaveLength(1);

	await editDocument(page);
	await page.getByRole('button', { name: 'Examples' }).click();
	await page.getByRole('menuitem', { name: 'Proofreading' }).click();
	const replaceDialog = page.getByRole('alertdialog', { name: 'Replace this edited document?' });
	await expect(replaceDialog).toBeVisible();
	await replaceDialog.getByRole('button', { name: 'Keep working' }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect(legalAssistant.getByText('The assistant response is scoped to the active document.')).toBeVisible();
	await expectSameEditorHost(editorHost);

	await page.getByRole('button', { name: 'Examples' }).click();
	const examplesMenu = page.getByRole('menu', { name: 'Examples' });
	const legalAssistantMenuItem = examplesMenu.getByRole('menuitem', { name: 'Legal Assistant' });
	await expect(legalAssistantMenuItem).toBeVisible();
	await expect(legalAssistantMenuItem).toHaveAttribute('href', '/examples/legal-assistant/');
	await expect(examplesMenu.getByRole('menuitem', { name: 'Proofreading' })).toBeVisible();
	await expect(examplesMenu.getByRole('menuitem', { name: 'Translation' })).toBeVisible();
	await expect(examplesMenu.getByRole('menuitem', { name: 'Template Builder' })).toBeVisible();
	await expect(examplesMenu.getByRole('menuitem', { name: 'Invoice' })).toBeVisible();

	await examplesMenu.getByRole('menuitem', { name: 'Proofreading' }).click();
	await page.getByRole('alertdialog', { name: 'Replace this edited document?' }).getByRole('button', { name: 'Replace document' }).click();
	await expect(page).toHaveURL(/\/examples\/proofreading\/$/);
	await expect(page.getByRole('region', { name: 'Proofreading Assistant' })).toBeVisible();
	await expect(page.getByText('Check the whole document or current selection for spelling, grammar, and clarity issues.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Review Document' })).toBeEnabled();
	await expect(page.getByRole('button', { name: 'Editor mode' })).toHaveText('Edit');
	await expect(page.getByText('The assistant response is scoped to the active document.')).toHaveCount(0);
	expect(requests).toHaveLength(1);
	await page.getByRole('button', { name: 'Review Document' }).click();
	const completionToast = page.locator('.workflow-completion-toast');
	await expect(completionToast).toHaveText(/Review complete/);
	await page.getByRole('button', { name: 'Dismiss grammar check confirmation' }).click();
	await expect(completionToast).toBeHidden();
	expect(requests).toHaveLength(2);

	await editDocument(page);
	await page.evaluate(() => window.history.back());
	await expect(replaceDialog).toBeVisible();
	await replaceDialog.getByRole('button', { name: 'Keep working' }).click();
	await expect(page).toHaveURL(/\/examples\/proofreading\/$/);

	await page.evaluate(() => window.history.back());
	await expect(replaceDialog).toBeVisible();
	await replaceDialog.getByRole('button', { name: 'Replace document' }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole('region', { name: 'Legal Assistant' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Find blanks to finish' })).toBeEnabled();
	await page.evaluate(() => window.history.forward());
	await expect(page).toHaveURL(/\/examples\/proofreading\/$/);
	await expect(page.getByRole('region', { name: 'Proofreading Assistant' })).toBeVisible();

	await page.getByRole('button', { name: 'Examples' }).click();
	await page.getByRole('menuitem', { name: 'Translation' }).click();
	await expect(page).toHaveURL(/\/examples\/translation\/$/);
	await expect(page.getByRole('region', { name: 'Translation Assistant' })).toBeVisible();
	await expect(page.getByText('Translate the whole document or current selection while preserving its structure.')).toBeVisible();
	await expect(page.getByRole('combobox', { name: 'Target language' })).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Translation instructions' })).toBeVisible();
	await page.getByRole('button', { name: 'Translate Document' }).click();
	await expect(completionToast).toHaveText(/Translation complete/);
	await page.getByRole('button', { name: 'Dismiss translation confirmation' }).click();
	await expect(completionToast).toBeHidden();
	expect(requests).toHaveLength(3);

	await page.getByRole('button', { name: 'Examples' }).click();
	await page.getByRole('menuitem', { name: 'Template Builder' }).click();
	await expect(page).toHaveURL(/\/examples\/template-builder\/$/);
	await expect(page.getByRole('region', { name: 'Template Builder' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Build Template' })).toBeEnabled();
	await expect(page.getByRole('region', { name: 'Placeholder catalog' })).toBeVisible();

	expect(requests).toHaveLength(3);
	await expectSameEditorHost(editorHost);
});

test('blank documents keep the assistant optional and uploads open it after import', async ({ page }) => {
	const requests = await mockAssistant(page, { failFirstRequest: true, delayMs: 100 });
	await page.goto('/blank/');
	await rememberEditorHost(page);
	await expect(page.getByRole('button', { name: 'Editor mode' })).toHaveText('Edit');

	await expect(page.getByRole('region', { name: 'AI Assistant' })).toBeHidden();
	await page.getByRole('button', { name: 'Open AI Assistant' }).click();
	const assistant = page.getByRole('region', { name: 'AI Assistant' });
	await expect(assistant).toBeVisible();
	await expect(assistant.getByRole('button', { name: /proofread|translate|template|summarize/i })).toHaveCount(0);
	expect(requests).toHaveLength(0);

	await assistant.getByRole('textbox', { name: 'Ask assistant' }).fill('Add a short opening paragraph.');
	await assistant.getByRole('button', { name: 'Submit' }).click();
	await expect(assistant.getByRole('status')).toContainText('Answering your request');
	await expect(assistant.getByRole('alert')).toHaveText('Temporary failure.');
	await expect(assistant.getByRole('textbox', { name: 'Ask assistant' })).toHaveValue('Add a short opening paragraph.');

	await assistant.getByRole('textbox', { name: 'Ask assistant' }).fill('Add a concise opening paragraph.');
	await assistant.getByRole('button', { name: 'Submit' }).click();
	await expect(assistant.getByText('The assistant response is scoped to the active document.')).toBeVisible();
	expect(requests).toHaveLength(2);

	await page.getByRole('link', { name: 'Upload Document' }).click();
	await expect(page).toHaveURL(/\/upload\/$/);
	await expect(page.getByRole('region', { name: 'AI Assistant' })).toBeHidden();
	await page.locator('input[type="file"]').setInputFiles({
		name: 'visitor-notes.txt',
		mimeType: 'text/plain',
		buffer: Buffer.from('Visitor document content'),
	});
	await expect(page.getByTestId('document-editor-host').locator(':scope > *').first()).toBeAttached({ timeout: 60_000 });
	await expect(page.getByRole('region', { name: 'AI Assistant' })).toBeVisible();
	await expect(page.getByText('The assistant response is scoped to the active document.')).toHaveCount(0);
	await expectSameEditorHost(page.getByTestId('document-editor-host'));

	await editDocument(page);
	await page.getByRole('link', { name: 'Upload Document' }).click();
	await page.locator('input[type="file"]').setInputFiles({
		name: 'replacement-notes.txt',
		mimeType: 'text/plain',
		buffer: Buffer.from('Replacement visitor document content'),
	});
	const uploadReplaceDialog = page.getByRole('alertdialog', { name: 'Replace this edited document?' });
	await expect(uploadReplaceDialog).toBeVisible();
	await uploadReplaceDialog.getByRole('button', { name: 'Keep working' }).click();
	await expect(page.getByRole('region', { name: 'AI Assistant' })).toBeVisible();

	await page.getByRole('link', { name: 'Upload Document' }).click();
	await page.locator('input[type="file"]').setInputFiles({
		name: 'replacement-notes.txt',
		mimeType: 'text/plain',
		buffer: Buffer.from('Replacement visitor document content'),
	});
	await expect(uploadReplaceDialog).toBeVisible();
	await uploadReplaceDialog.getByRole('button', { name: 'Replace document' }).click();
	await expect(page.getByRole('region', { name: 'AI Assistant' })).toBeVisible();

	await page.goto('/embed/?experience=proofreading');
	await rememberEditorHost(page);
	await expect(page.locator('.app-header')).toHaveCount(0);
	await expect(page.getByRole('region', { name: 'Proofreading Assistant' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'View source' })).toBeVisible();

	await page.goto('/embed/?experience=legal-assistant&viewSource=false');
	await rememberEditorHost(page);
	await expect(page.getByRole('region', { name: 'Legal Assistant' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'View source' })).toHaveCount(0);

	await page.goto('/embed/sample/');
	await rememberEditorHost(page);
	await expect(page.getByRole('region', { name: 'AI Assistant' })).toBeVisible();

	await page.goto('/embed/custom/');
	await rememberEditorHost(page);
	await expect(page.getByRole('region', { name: 'AI Assistant' })).toBeHidden();
	await expect(page.getByRole('button', { name: 'Open AI Assistant' })).toBeVisible();
});

test('focused workflows retry once with the validator feedback', async ({ page }) => {
	const requests = await mockAssistant(page, { failFirstWorkflow: true });
	await page.goto('/examples/proofreading/');
	await rememberEditorHost(page);
	await page.getByRole('button', { name: 'Review Document' }).click();
	await expect(page.locator('.workflow-completion-toast')).toHaveText(/Review complete/);
	await expect(page.getByRole('alert')).toHaveCount(0);
	const workflowRequests = requests.filter((request) => request.workflowInput);
	expect(workflowRequests).toHaveLength(2);
	expect(workflowRequests[0]).not.toHaveProperty('retryFeedback');
	expect(workflowRequests[1]?.retryFeedback).toMatchObject({ issues: [{ path: '/fragment/content', message: 'must be array' }] });
});

test('proofreading follows the current selection', async ({ page }) => {
	const requests = await mockAssistant(page);
	await page.goto('/examples/proofreading/');
	const editorHost = await rememberEditorHost(page);
	await editorHost.click({ position: { x: 250, y: 250 } });
	await page.keyboard.press('ControlOrMeta+a');
	await page.getByRole('button', { name: 'Review Selection', exact: true }).click();
	await expect(page.locator('.workflow-completion-toast')).toHaveText(/Review complete/);
	expect(requests.find((request) => request.workflowInput)?.workflowInput).toMatchObject({ scope: 'selection' });

	await editorHost.click({ position: { x: 250, y: 250 } });
	await page.keyboard.press('ArrowRight');
	await expect(page.getByRole('button', { name: 'Review Document', exact: true })).toBeVisible();
});

test('embedded Legal Assistant can apply a prompt to selected text', async ({ page }) => {
	const requests = await mockAssistant(page);
	await page.goto('/embed/?experience=legal-assistant');
	await rememberEditorHost(page);
	const panel = page.getByRole('region', { name: 'Legal Assistant' });
	const applySelection = panel.getByRole('button', { name: 'Apply to selection' });
	await expect(applySelection).toBeHidden();

	const title = page.getByTestId('document-editor-host');
	await expect(page.getByRole('button', { name: 'Editor mode' })).toHaveText('Review');
	await title.dblclick({ position: { x: 160, y: 250 } });
	await expect(panel.locator('.assistant-scope')).toContainText('Mutual');
	await expect(applySelection).toBeVisible();
	await panel.getByRole('textbox', { name: 'Ask assistant' }).fill('Keep this wording.');
	await expect(applySelection).toBeEnabled();
	await applySelection.click();
	await expect(panel.getByText('Applied the requested change to the selected content.')).toBeVisible();
	expect(requests).toHaveLength(1);
	expect(requests[0]).toMatchObject({ useCase: 'generic', task: 'Keep this wording.', workflowInput: { scope: 'selection' } });
	await expect(page.getByRole('button', { name: 'Editor mode' })).toHaveText('Review');

	await title.click({ position: { x: 160, y: 250 } });
	await expect(panel.locator('.assistant-scope')).toBeHidden();
	await expect(applySelection).toBeHidden();
});
