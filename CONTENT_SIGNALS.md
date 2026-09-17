# Content Signals for `app/robots.ts`

Fork of [vercel/next.js](https://github.com/vercel/next.js) (`canary`) adding first-class [Content Signals](https://contentsignals.org/) to the metadata `robots.ts` route.

Implements [Discussion #85382](https://github.com/vercel/next.js/discussions/85382) plus site-wide **and** per-link signals.

## Branch

`feat/robots-content-signals`

Upstream: `https://github.com/vercel/next.js.git` (cloned `--depth 1 --branch canary`).

To open a PR: fork `vercel/next.js`, add this remote, unshallow if needed, push this branch. Related discussion: https://github.com/vercel/next.js/discussions/85382

## API

```ts
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    // Site-wide default (every User-agent group that does not override)
    contentSignal: { search: true, aiInput: true, aiTrain: false },

    // Optional CC0 policy comment from contentsignals.org
    contentSignalsPolicy: false,

    rules: [
      { userAgent: '*', allow: '/' },
      {
        userAgent: 'GPTBot',
        allow: '/',
        // Replaces the file-level default for this group
        contentSignal: { search: true, aiInput: false, aiTrain: false },
      },
    ],
  }
}
```

Per-link (path-scoped) signals:

```ts
contentSignal: [
  { path: '/blog', search: true, aiTrain: false, aiInput: true },
  { path: '/docs', search: true, aiInput: true, aiTrain: true },
]
```

Same signals on several paths:

```ts
contentSignal: { path: ['/blog', '/learn'], search: true, aiTrain: false }
```

### Serialization

| Input | `robots.txt` |
| --- | --- |
| `{ search: true, aiTrain: false }` | `Content-Signal: search=yes, ai-train=no` |
| `{ path: '/blog', search: true }` | `Content-Signal: /blog search=yes` |
| omitted key | no preference (key not written) |
| `contentSignal: {}` on a rule | no `Content-Signal` line (opts that UA out of the file-level default) |

Directive name is `Content-Signal`. Keys are emitted in spec order: `search`, `ai-input`, `ai-train`. Lines sit after `User-Agent` and before `Allow` / `Disallow`, matching contentsignals.org examples.

## Files

- `packages/next/src/lib/metadata/types/metadata-interface.ts`
- `packages/next/src/build/webpack/loaders/metadata/resolve-route-data.ts`
- `packages/next/src/build/webpack/loaders/metadata/resolve-route-data.test.ts`
- `docs/01-app/03-api-reference/03-file-conventions/01-metadata/robots.mdx`
- `test/production/typescript-basic/typechecking/metadata/robots.ts`
- `test/e2e/app-dir/metadata-robots-content-signals/`

Drop `CONTENT_SIGNALS.md` before opening the upstream PR if maintainers do not want a fork readme.

## Tests

Unit serializer tests do not need a full Next.js build. From this repo, after `pnpm install` and `pnpm build`:

```sh
pnpm test-unit src/build/webpack/loaders/metadata/resolve-route-data.test.ts
```

(paths relative to `packages/next` as used by the Next.js unit runner)

```sh
pnpm test-start test/e2e/app-dir/metadata-robots-content-signals/
```
