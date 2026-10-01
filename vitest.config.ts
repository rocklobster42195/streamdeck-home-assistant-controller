import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['plugin/src/**/*.test.ts'],
    },
});
