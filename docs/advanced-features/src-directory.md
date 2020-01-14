---
description: Save pages under the `src` directory as an alternative to the root `pages` directory.
---

# `src` Directory

Pages can also be added under `src/pages` as an alternative to the root `pages` directory.

The `src` directory is very common in many apps and Next.js supports it by default.

## Caveats

- `src/pages` will be ignored if `pages` is present in the root directory
- Config files like `next.config.js` and `tsconfig.json` should be inside the root directory, moving them to `src` won't work. Same goes for the [`public` directory](/docs/basic-features/static-file-serving.md)

## Related

For more information on what to do next, we recommend the following sections:

<div class="card">
  <a href="/docs/basic-features/pages.md">
    <b>Pages:</b>
    <small>Learn more about what pages are in Next.js</small>
  </a>
</div>
