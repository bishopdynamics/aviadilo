import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  {
    ignores: [
      'src/config/validators.js',
      'src/config/types.ts',
      'src/config/integration-types.ts',
      'src/data/types.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: { '@typescript-eslint/no-empty-object-type': 'off' },
  },
);
