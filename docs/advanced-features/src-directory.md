---
description: Save pages under the `src` directory as an alternative to the root `pages` directory.
---

# `src/` Directory

Pages can also be added under `src/pages` as an alternative to the root `pages`
directory. The `src/` directory is very common in many apps and Next.js supports
it by default.

## Configuration

A project with a `src/` directory configuration can be created with
`create-next-app`, or it can be added to an existing project.

### New projects

Two options exist to create a new project with a `src/` directory configured:

```shell
# the TypeScript template enables src/ rootDir by default
create-next-app --typescript

# or, to use without TS, create from the src-dir example
create-next-app --example src-dir
```

### Existing projects (TypeScript)

If your project is **not using TypeScript**, then there is **no configuration**
needed besides moving the files to `src/`.

Projects with TypeScript enabled will check your project for type errors on
`next build`. Therefore, when using a `src/` directory, you will want to adjust
the following values in tsconfig.json:

```json
{
  // ...
  "rootDir": "src/",
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx"]
  // ...
}
```

The `rootDir` field will prevent type-checking of unwanted files outside of
`src/`, and the `include` field will prevent conflicts with the `rootDir`
setting by limiting pattern matches to `src/`.

#### Footnote

This configuration will be applied automatically if the project is [created with
`create-next-app --typescript`](/docs/basic-features/typescript#new-projects).
The changes above are only needed if you added TypeScript to your project
manually.

## Caveats

- `src/pages` will be ignored if `pages` is present in the root directory
- Config files like `next.config.js` and `tsconfig.json` should be inside the
  root directory, as well as the [`public`
  directory](/docs/basic-features/static-file-serving.md)

## Related

For more information on what to do next, we recommend the following sections:

<div class="card">
  <a href="/docs/basic-features/pages.md">
    <b>Pages:</b>
    <small>Learn more about what pages are in Next.js</small>
  </a>
</div>
