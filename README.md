# Nutrient Document Authoring demo

This is the unified public demo for Document Authoring and its AI Assistant. Clone [the public source repository](https://github.com/PSPDFKit/nutrient-document-authoring-example) and build it independently with Node.js 22.12+ or 24 and npm. It uses published SDK 1.21.0 and AI 2.0.0 packages.

[Try the demo](https://document-authoring-demo.nutrient.io/). The basic SDK integration examples linked from npm are a separate project: [Document Authoring SDK examples](https://github.com/PSPDFKit/pspdfkit-document-authoring-example).

```sh
git clone https://github.com/PSPDFKit/nutrient-document-authoring-example.git
cd nutrient-document-authoring-example
npm ci
npm run typecheck
npm run build
npm run dev
```

The build produces the browser app in `dist/` and the Vercel chat handler in `server/chat.mjs`. SDK assets load from its versioned public CDN. Sample documents live in `src/samples/`.

The app is a single page. Every route serves `index.html` (Vite's SPA fallback locally, a rewrite in `vercel.json` on Vercel) and the client reads the path to pick the document experience. The root route opens Legal Assistant. Use `/blank/`, `/upload/`, or `/examples/<name>/` for a specific document experience. Embedded views use the same app at `/embed/`; choose the initial experience with `?experience=<name>` and hide the source link with `&viewSource=false`.

Legal Assistant and the generic AI Assistant show the selected text and an **Apply to selection** action when text is selected. This action uses the selection workflow and respects the editor's Edit or Review mode.

AI requests use `OPENAI_API_KEY`. Set `DOCUMENT_AUTHORING_DEMO_OPENAI_MODEL` only when you need to override the demo's default model.

Structured workflows send the active SDK fragment contract with their input, and the server uses that contract to build request-specific output guidance.

Vercel uses `npm ci` and `npm run build` from this directory. Configure `OPENAI_API_KEY` in the server environment. For local AI requests, export it in the shell before `npm run dev`. The browser uses hostname-specific demo licenses; other hosts use the SDK evaluation mode.

The server validates workflow input and output through the published Node SDK, and the editor validates replacements again before applying them. Run `npm test` for browser regression coverage; those tests stub model responses.

The Vercel function explicitly includes the Node SDK runtime assets from its npm package. These files are loaded dynamically and are not all discovered by serverless file tracing.

## Sample documents

The Legal Assistant uses the Common Paper Mutual NDA, released under CC BY 4.0. The proofreading sample adapts Information Commissioner’s Office guidance under the Open Government Licence v3.0. The translation sample uses the NIST CSF 2.0 small-business overview.
