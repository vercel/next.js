import { createNext } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'

describe('eslint plugin deps', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.tsx': `export default function Page() {
  return <p>hello world</p>;
}
`,
        '.eslintrc': `
{
  "parser": "@typescript-eslint/parser",
  "plugins": ["react", "@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "next/core-web-vitals",
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
    "plugin:import/typescript",
    "plugin:import/recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "prettier"
  ],
  "env": {
    "es2021": true,
    "browser": true
  },
  "parserOptions": {
    "ecmaVersion": 12,
    "sourceType": "module",
    "project": ["./tsconfig.json"],
    "ecmaFeatures": { "jsx": true }
  },
  "settings": {
    "react": { "version": "detect" },
    "import/resolver": { "typescript": {} }
  },
  "rules": {
    "no-else-return": "error",
    "semi": ["error", "always"],
    "no-useless-rename": "error",
    "quotes": ["error", "double"],
    "eol-last": ["error", "always"],
    "no-console": [2, { "allow": ["warn", "error"] }],
    "no-multiple-empty-lines": ["error", { "max": 1 }],
    "no-unused-expressions": ["error", { "allowShortCircuit": true, "allowTernary": true, "enforceForJSX": true }],

    "import/named": 0,
    "import/order": [
      "error",
      {
        "warnOnUnassignedImports": true,
        "newlines-between": "always",
        "groups": ["builtin", "external", "internal", "parent", ["sibling", "index"], "object", "type"]
      }
    ],

    "react/display-name": 0,
    "react/prop-types": 0,
    "react/react-in-jsx-scope": 0,
    "react/self-closing-comp": ["error", { "component": true }],

    "react-hooks/exhaustive-deps": ["warn", { "additionalHooks": "useIsomorphicLayoutEffect" }],

    "@typescript-eslint/indent": 0,
    "@typescript-eslint/no-explicit-any": 0,
    "@typescript-eslint/no-var-requires": 0,
    "@typescript-eslint/no-use-before-define": 0,
    "@typescript-eslint/member-delimiter-style": 0,
    "@typescript-eslint/explicit-function-return-type": 0,
    "@typescript-eslint/explicit-member-accessibility": 0,
    "@typescript-eslint/no-unused-vars": [2, { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/array-type": ["error", { "default": "array-simple" }],
    "@typescript-eslint/no-unnecessary-boolean-literal-compare": [
      "error",
      { "allowComparingNullableBooleansToTrue": false }
    ]
  }
}
        `,
        'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2017",
    "lib": [
      "dom",
      "dom.iterable",
      "esnext"
    ],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": false,
    // The rule @typescript-eslint/no-unnecessary-boolean-literal-compare requires the \`strictNullChecks\` compiler option to be turned on to function correctly.
    "strictNullChecks": true,
    "noEmit": true,
    "incremental": true,
    "module": "esnext",
    "esModuleInterop": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "plugins": [
      {
        "name": "next"
      }
    ]
  },
  "include": [
    "next-env.d.ts",
    ".next/types/**/*.ts",
    "**/*.ts",
    "**/*.tsx"
  ],
  "exclude": [
    "node_modules",
  ]
}
        `,
      },
      dependencies: {
        // Manually installed @typescript-eslint/eslint-plugin, expect to be deduped
        '@typescript-eslint/eslint-plugin': 'latest',
        '@typescript-eslint/parser': 'latest',
        'eslint-config-prettier': 'latest',
        'eslint-plugin-import': 'latest',
        'eslint-plugin-react': 'latest',
        '@types/node': 'latest',
        '@types/react': 'latest',
        '@types/react-dom': 'latest',
        // Use minimum peer dep version instead of v9 of eslint to avoid breaking changes
        eslint: '8.56.0',
        'eslint-config-next': 'latest',
        typescript: 'latest',
      },
      packageJson: {
        scripts: {
          build: 'next build --no-lint && next lint',
        },
      },
      buildCommand: 'pnpm build',
    })
  })
  afterAll(() => next.destroy())

  it('should work', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello world')
  })
})
