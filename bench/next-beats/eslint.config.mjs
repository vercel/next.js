import nextConfig from 'eslint-config-next';
import eslintConfigPrettier from 'eslint-config-prettier';

const eslintConfig = [
  {
    ignores: ['**/next-env.d.ts', '.next/**', 'node_modules/**', 'generated/**'],
  },
  ...nextConfig,
  eslintConfigPrettier,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        {
          prefer: 'type-imports',
        },
      ],
      'arrow-body-style': ['warn', 'as-needed'],
      'import/order': [
        'warn',
        {
          alphabetize: {
            order: 'asc',
          },
          groups: ['builtin', 'external', 'parent', 'sibling', 'index', 'object', 'type'],
          pathGroups: [
            {
              group: 'parent',
              pattern: '@/**/**',
              position: 'before',
            },
          ],
        },
      ],
      'no-console': 'warn',
      'no-redeclare': 'warn',
      quotes: ['warn', 'single', { avoidEscape: true }],
      'react/display-name': 'error',
      'react/jsx-key': 'warn',
      'react/react-in-jsx-scope': 'off',
      'react/self-closing-comp': [
        'error',
        {
          component: true,
          html: true,
        },
      ],
      'spaced-comment': 'warn',
    },
  },
];

export default eslintConfig;
