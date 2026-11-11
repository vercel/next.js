# Run this suite with experimental `next test`

The five existing test bodies can also run in the Next-owned development runner.
This keeps their `vitest` imports and uses Next compilation with the `jsdom` test
environment. These remain DOM component tests: they render synchronous components
with Testing Library and do not exercise the RSC rendering pipeline or hydration.

Keep the dependencies declared in this example, including `server-only`, `jsdom`,
and `@testing-library/react`. Add `next.test.config.json`:

```json
{
  "maxWorkers": 1,
  "projects": [
    {
      "name": "with-vitest",
      "environment": "jsdom",
      "include": [
        "__tests__/**/*.test.tsx",
        "app/**/*.test.ts",
        "app/**/*.test.tsx"
      ]
    }
  ]
}
```

Run the existing suite:

```bash
pnpm exec next test --run
```

The Next configuration selects the environment and files explicitly. The Vite
React plugin in `vitest.config.ts` is not part of Next compilation. The existing
`pnpm test` command still invokes Vitest and its original configuration.

To check these tests using the public Next declarations without installing a
Vitest runtime, add a separate `tsconfig.next-test.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["node", "next/experimental/testing/vitest-global"],
    "skipLibCheck": false,
    "incremental": false
  },
  "include": [
    "next-env.d.ts",
    "__tests__/**/*.tsx",
    "app/**/*.ts",
    "app/**/*.tsx"
  ],
  "exclude": ["node_modules", "vitest.config.ts"]
}
```

```bash
pnpm exec tsc --project tsconfig.next-test.json --noEmit
```

Keep the usual Next-generated `next-env.d.ts`. With TypeScript 6, the original
example's ES5 target additionally needs `"ignoreDeprecations": "6.0"` in this
separate test configuration. Retain any other types your test project requires.
The declaration opt-in supplies types for the existing bare `vitest` imports;
the Next test compiler supplies their runtime implementation.

This migration has development-profile evidence for all five unchanged cases,
including the external `server-only` factory. Production DOM execution remains
open: React's production build does not expose `act`, and the production mocking
profile currently rejects this external factory. Real-browser tests and Next RSC
rendering use separate environments and rendering contracts.
