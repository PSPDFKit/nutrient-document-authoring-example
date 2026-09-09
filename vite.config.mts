import { defineConfig, type Plugin } from 'vite';

const chatApiPlugin = (): Plugin => ({
	name: 'document-authoring-demo-chat-api',
	configureServer(server) {
		server.middlewares.use('/api/chat', async (request, response, next) => {
			if (request.method !== 'POST') {
				next();
				return;
			}
			const { default: handler } = (await server.ssrLoadModule('/src/server/chat.ts')) as typeof import('./src/server/chat');
			await handler(request, response);
		});
	},
});

export default defineConfig({
	plugins: [chatApiPlugin()],

	build: { assetsInlineLimit: 0, target: 'es2022' },
});
