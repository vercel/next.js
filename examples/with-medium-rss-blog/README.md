# Medium RSS Blog Example

This example shows how to render a Next.js App Router blog backed by a user's [Medium RSS feed](https://help.medium.com/hc/en-us/articles/214874118-RSS-feeds), sanitized for safe HTML rendering and cached with ISR.

Most blog examples in this repo use local Markdown or MDX files. This one is different — the post content lives on Medium, so you don't have to maintain a separate Markdown copy in your repo.

## Features

- **Live fetch from Medium** — `lib/medium.ts` parses the feed at `https://medium.com/feed/@<username>` using [`rss-parser`](https://github.com/rbren/rss-parser).
- **Committed fallback snapshot** — `lib/medium-feed.json` is used when `MEDIUM_USERNAME` is empty or the network request fails, so the page never crashes on a fresh clone.
- **HTML sanitization** — `lib/sanitize.ts` runs the feed content through `isomorphic-dompurify` with an explicit tag + attribute allowlist before rendering.
- **ISR caching** — both `/blog` and `/blog/[slug]` declare `revalidate = 43200` (12 hours), so Vercel only re-fetches the feed twice a day.
- **Static params** — `generateStaticParams` pre-renders one page per published post at build time.

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-medium-rss-blog&project-name=with-medium-rss-blog&repository-name=with-medium-rss-blog)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-medium-rss-blog with-medium-rss-blog-app
```

```bash
yarn create next-app --example with-medium-rss-blog with-medium-rss-blog-app
```

```bash
pnpm create next-app --example with-medium-rss-blog with-medium-rss-blog-app
```

## Configuration

Copy `.env.example` to `.env.local` and set your Medium handle (without the `@`):

```bash
cp .env.example .env.local
```

```bash
# .env.local
MEDIUM_USERNAME="your-handle"
```

Leave it empty to render an empty blog list (the example will use the committed fallback snapshot in `lib/medium-feed.json`).

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/app/building-your-application/deploying)).

## Notes

- The sanitizer uses a tag allowlist (no `script`, no event handlers, no inline styles). Any HTML outside the allowlist is stripped — see the `ALLOWED_TAGS` / `ALLOWED_ATTR` constants in [`lib/sanitize.ts`](./lib/sanitize.ts).
- Medium's RSS feed exposes the full post HTML under `content:encoded`. We fall back to `content` when that's absent.
- The route is statically generated via `generateStaticParams`. After a deploy, new Medium posts won't appear until the next revalidation cycle.