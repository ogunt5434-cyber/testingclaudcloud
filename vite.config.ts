import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    // Only the game page is built. The art galleries (gallery-heroes.html, gallery-env.html) are dev-server
    // pages for reviewing the generated art and never ship.
    rolldownOptions: { input: fileURLToPath(new URL('./index.html', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // Process the stylesheet (instead of stubbing it as empty) so tests can read it with `?raw`.
    css: { include: [/style\.css/] },
  },
});
