// @ts-check
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: ['**/dist/**', '**/*.sdPlugin/bin/**', 'node_modules/**', '**/*.sdPlugin/ui/pi.js', '**/*.sdPlugin/ui/locales.generated.js'],
    },
    tseslint.configs.recommended,
    {
        rules: {
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },
);
