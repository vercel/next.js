# TypeScript opt-ins for Next-owned tests

Use a separate test TypeScript project so these declarations do not change the
application's import resolution. For example, a `tsconfig.test.json` can contain:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["node", "next/experimental/testing/vitest-global"]
  },
  "include": ["tests/**/*.ts", "test-helpers/**/*.d.ts", "next.test.config.ts"],
  "exclude": ["node_modules"]
}
```

Keep any other types needed by the test project in its `types` list. The opt-in
provides the existing Next declarations for bare `vitest` and `vitest/config`
imports, including declaration files in helper packages. It does not require a
`paths` mapping or a Vitest/Vite runtime. The config route exposes only the
existing Next config helper declarations; accepted runtime config options and
plugin support do not change.

For test projects using `globals: true`, replace that type entry with
`next/experimental/testing/vitest-globals`. The declaration file includes the bare
import bridge and only the global bindings currently installed by the Next-owned
runner, including `chai`. It does not enable runtime globals.

Add `next/experimental/testing/vitest-import-meta` to the test project's type list
when using the optional `import.meta.vitest` namespace. This supplies its type;
it does not enable in-source collection, alter compiler admission, or change
ordinary production output. In-source compilation and its supported profiles
remain separate runtime requirements.

These entries do not install a package named `vitest`. An unchanged
`types: ["vitest/globals"]` entry requires that actual upstream package and is not
resolved by the Next-only opt-in. Other public subpaths, browser/editor execution,
and broad installed helper compatibility are separate requirements. Ordinary
Node imports are not redirected: only the Next test compiler supplies supported
runtime aliases.

The separate [editor discovery and watch controls](./editor-api.md) guide
describes the qualified Next-owned protocol and its current execution scope.

The [streamed route response guide](./rsc-route-rendering.md) covers reading
headers, consuming HTML or Flight, and closing an unfinished RSC route response.
