import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**', 'src/static/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    files: ['**/*.{ts,tsx,js}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.worker,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^(_|h$|Fragment$)',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-console': 'off',
    },
  },
  {
    files: ['src/**/*.tsx', 'src/app/**/*.ts', 'src/ui/mount.ts', 'src/pages/Editor/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  }
)
