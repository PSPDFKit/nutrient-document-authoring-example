import { getAiToolDefinitions } from '@nutrient-sdk/document-authoring-ai';
import { toVercelAiTools } from '@nutrient-sdk/document-authoring-ai/vercel';

export const toOpenAiChatTools = (reviewComments: 'create' | 'disabled') => {
	const tools = toVercelAiTools(getAiToolDefinitions({ reviewComments }));
	const formatList = tools.format_list;

	if (!formatList) return tools;

	// OpenAI now needs an explicit non-strict setting for format_list's branch
	// union. Omitting it returns an empty, zero-token completion. The SDK still
	// validates every tool call before executing it.
	return { ...tools, format_list: { ...formatList, strict: false } };
};
