import assert from 'node:assert/strict';

const { default: handler } = await import('../api/chat.js');

assert.equal(typeof handler, 'function', 'The Vercel chat entrypoint must default-export its request handler.');
