// ESLint flat config for ESLint v9+
// Mirrors previous .eslintrc.json and .eslintignore
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  // Ignored paths (replace .eslintignore)
  { ignores: ['dist/**', 'node_modules/**'] },

  // Base JS recommended rules
  js.configs.recommended,

  // Global tweaks
  {
    rules: {
      // Keep console allowed as before
      'no-console': 'off',
    },
  },

  // TypeScript files
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // Start from the plugin's recommended rules
      ...(tsPlugin.configs?.recommended?.rules ?? {}),

      // Project-specific rule adjustments
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },

  // Test files overrides
  {
    files: ['tests/**/*.js', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      'no-unused-expressions': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  // Disable stylistic rules that conflict with Prettier
  eslintConfigPrettier,
];

