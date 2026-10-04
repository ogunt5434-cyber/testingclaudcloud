import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
    // Process the stylesheet (instead of stubbing it as empty) so tests can read it with `?raw`.
    css: { include: [/style\.css/] },
  },
});
