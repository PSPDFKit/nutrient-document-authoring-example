import { openai } from '@ai-sdk/openai';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { convertToModelMessages, generateText, Output, stepCountIs, streamText, type UIMessage } from 'ai';

import { getAiPromptGuide, prepareWorkflowRun } from '@nutrient-sdk/document-authoring-ai';
import { toVercelAiWorkflowEditsSchema } from '@nutrient-sdk/document-authoring-ai/vercel';
import { toOpenAiChatTools } from '../lib/openai-chat-tools';
import { createDocAuthSystem } from '@nutrient-sdk/document-authoring/node';
import { getAiUseCaseWorkflow, normalizeAiUseCaseId, normalizeTranslationTargetLanguage } from '../lib/ai-use-cases';

export const maxDuration = 300;

type ChatRequestBody = {
	messages?: unknown;
	reviewComments?: unknown;
	task?: unknown;
	useCase?: unknown;
	translationTargetLanguage?: unknown;
	workflowInput?: unknown;
};

export const postChat = async (request: Request): Promise<Response> => {
	if (!process.env.OPENAI_API_KEY) {
		return Response.json({ error: 'OPENAI_API_KEY is not configured.' }, { status: 500 });
	}

	const body: ChatRequestBody = await request.json().catch(() => ({}));
	if ('workflowInput' in body) {
		const workflow = getAiUseCaseWorkflow(normalizeAiUseCaseId(body.useCase), {
			translationTargetLanguage: normalizeTranslationTargetLanguage(body.translationTargetLanguage),
		});
		// Fragment validation does not need registered fonts.
		const system = await createDocAuthSystem({ fontConfig: { fonts: [] } });
		try {
			let workflowRun;
			try {
				workflowRun = prepareWorkflowRun({
					workflow,
					input: body.workflowInput,
					task: typeof body.task === 'string' && body.task.trim() ? body.task : undefined,
					validateFragment: (fragment) => system.validateFragment(fragment),
				});
			} catch {
				return Response.json({ error: 'Workflow input did not include a valid fragment.' }, { status: 400 });
			}
			let previousFailure: string | undefined;
			for (let attempt = 0; attempt < 3; attempt++) {
				try {
					const result = await generateText({
						model: openai(process.env.DOCUMENT_AUTHORING_DEMO_OPENAI_MODEL ?? (attempt === 2 ? 'gpt-5.4' : 'gpt-5.4-mini')),
						system: workflowRun.systemPrompt,
						prompt: workflowRun.createPrompt(previousFailure),
						output: Output.object(toVercelAiWorkflowEditsSchema()),
						providerOptions: { openai: { strictJsonSchema: false } },
					});
					const output = workflowRun.apply(result.output);
					return Response.json({ output }, { headers: { 'x-document-authoring-workflow-attempts': String(attempt + 1) } });
				} catch (error) {
					previousFailure = (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
				}
			}
			return Response.json(
				{
					error: previousFailure
						? `The model did not return valid workflow edits: ${previousFailure}`
						: 'The model did not return valid workflow edits.',
				},
				{ status: 502 },
			);
		} finally {
			system.destroy();
		}
	}
	if (!Array.isArray(body.messages)) {
		return Response.json({ error: 'Invalid chat request.' }, { status: 400 });
	}

	const modelId = process.env.DOCUMENT_AUTHORING_DEMO_OPENAI_MODEL ?? 'gpt-5.4-mini';
	const reviewComments = body.reviewComments === 'create' ? 'create' : 'disabled';
	const result = streamText({
		model: openai(modelId),
		system: `${getAiPromptGuide()}

When an edit is unsupported by the available tools, say so clearly instead of inventing a workaround.
${reviewComments === 'create' ? 'Review comments are enabled. Include a concise reviewComment on every write tool call.' : 'Review comments are disabled. Do not include reviewComment on any tool call.'}
Keep user-facing replies concise.`,
		messages: await convertToModelMessages(body.messages as UIMessage[]),
		stopWhen: stepCountIs(20),
		tools: toOpenAiChatTools(reviewComments),
	});

	return result.toUIMessageStreamResponse();
};

const readRequestBody = async (request: IncomingMessage): Promise<Uint8Array | undefined> => {
	if (request.method === 'GET' || request.method === 'HEAD') return undefined;
	const chunks: Uint8Array[] = [];
	for await (const chunk of request) {
		chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
	}
	return Buffer.concat(chunks);
};

const toWebHeaders = (request: IncomingMessage) => {
	const headers = new Headers();
	for (const [name, value] of Object.entries(request.headers)) {
		if (Array.isArray(value)) {
			for (const item of value) headers.append(name, item);
		} else if (value !== undefined) {
			headers.set(name, value);
		}
	}
	return headers;
};

export default async function handler(request: IncomingMessage, response: ServerResponse) {
	if (request.method !== 'POST') {
		response.statusCode = 405;
		response.setHeader('Allow', 'POST');
		response.end();
		return;
	}

	const result = await postChat(
		new Request(`http://${request.headers.host ?? 'localhost'}${request.url ?? '/api/chat'}`, {
			method: request.method,
			headers: toWebHeaders(request),
			body: await readRequestBody(request),
		}),
	);

	response.statusCode = result.status;
	result.headers.forEach((value, name) => response.setHeader(name, value));
	if (!result.body) {
		response.end();
		return;
	}
	const reader = result.body.getReader();
	let readResult = await reader.read();
	while (!readResult.done) {
		response.write(readResult.value);
		readResult = await reader.read();
	}
	response.end();
}
