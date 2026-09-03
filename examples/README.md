# Next.js Examples

> _This document was drafted by an AI assistant from a conversation with a Next.js maintainer. It captures current intent for what belongs in this directory and is subject to revision by the maintainers._

This directory contains official examples maintained by the Next.js team. Each example is installable via:

```bash
pnpm create next-app --example <example-name>
```

## Inclusion criteria

An example belongs here only if it clears the bar below. When in doubt, the default answer is **no**.

### 1. It must teach something Next.js-specific

If you could swap "Next.js" for "any React framework" and the code is unchanged, the example is a library demo, not a Next.js example. Good examples show integration nuances at the framework boundaries: route handlers, middleware, edge runtime, cache components, RSC boundaries, app router conventions, streaming, revalidation.

### 2. It must fit one of these categories

1. **Database and data-layer connections** (excluding CMS). Shows how to wire a driver or ORM into Next.js, including connection pooling, request-scoping, and runtime constraints.
2. **Deployment and runtime packaging.** Docker images, standalone output, static export, self-hosting patterns. Anything that demonstrates how Next.js runs outside the default managed target.
3. **Edge cases or complex setups** that legitimately need more than a docs page or guide can provide.
4. **Quick-start product templates** for a recognizable shape: blog, storefront, docs site, dashboard.

### 3. It must survive these filters

- **One canonical example per category.** We do not ship N vendor variants of the same thing (state managers, auth providers, form libraries, analytics, CMSes). Vendor-specific starters belong in the vendor's repo.
- **Upstream does not do it better.** If the integration has a well-maintained official starter from the vendor, ours will drift and lose. Link to theirs from the docs instead, or add an entry to the [Using Next.js with X](#using-nextjs-with-x) section below.
- **Not redundant with `create-next-app`.** Anything the CNA wizard scaffolds via a flag (TypeScript, Tailwind, ESLint, App Router, src dir) does not need a dedicated `with-*` example.
- **Not redundant with the framework.** Features Next.js has absorbed (built-in i18n, env vars, image optimization, MDX) live in the docs, not here.
- **Reflects modern Next.js.** Pre-App-Router or pages-only examples need a specific reason to exist, such as documenting a migration path. Patterns now considered anti-patterns (custom servers, `getInitialProps`) need explicit justification.
- **Referenced from docs? Keep, or update docs first.** Examples linked from `docs/` are part of the documentation surface area. If an example would otherwise be evicted but is referenced from a docs page, either update the docs in the same change to remove the reference, or keep the example. Never leave a docs page pointing at a removed example.

### 4. Maintenance is part of the contract

Publishing an example is an implicit promise to maintain it. An example becomes an eviction candidate when any of the following is true and there is no maintainer stepping forward:

- It depends on a library or vendor that has been archived, sunset, or officially deprecated.
- It breaks on the current Next.js release.
- It teaches a pattern the framework has since absorbed or moved past.

Removed examples remain in git history and can always be resurrected if the need returns. If you maintain a tool whose example was removed and want to bring it back, see the submission criteria.

## Submitting a new example

Before opening a PR, confirm:

1. The example clears every filter above.
2. There is no existing example in the same category (see "one canonical example per category").
3. You, your team, or the vendor behind the integration can commit to maintaining it.

If the criteria are not met, consider one of these alternatives instead:

- A docs page or guide in the main Next.js documentation.
- Publishing the example in your own repo and linking to it from your integration docs.
- Submitting to the Vercel templates gallery.
- Adding an entry to the [Using Next.js with X](#using-nextjs-with-x) section below.

## Using Next.js with X

When the canonical setup for a tool lives upstream (in the vendor's docs, framework adapter, or starter kit), this directory points there instead of shipping an in-tree example that drifts. The list below is a curated set of cornerstones, not an exhaustive directory. PRs that add an entry for a tool you maintain are welcome.

- **Storybook**: [`@storybook/nextjs`](https://storybook.js.org/docs/get-started/frameworks/nextjs) is the official framework adapter. Run `npx storybook init` inside your Next.js project to configure it.
- **Tailwind CSS**: [Install Tailwind CSS with Next.js](https://tailwindcss.com/docs/guides/nextjs).
- **Clerk**: [Clerk Next.js quickstart](https://clerk.com/docs/quickstarts/nextjs).
- **Auth.js (NextAuth.js)**: [Auth.js installation for Next.js](https://authjs.dev/getting-started/installation?framework=next.js).
- **Sentry**: [Sentry Next.js SDK guide](https://docs.sentry.io/platforms/javascript/guides/nextjs).

## Looking for an example that used to be here?

If you are looking for an example that has been removed:

1. **Check git history.** Removed examples are still recoverable from earlier commits in this repository. The PR or commit that removed an example is the best record of why it went and where to look instead.
2. **Check the [Using Next.js with X](#using-nextjs-with-x) section above.** Many integrations now live upstream in the vendor's docs.
3. **Check the library or service's own documentation.** For most third-party integrations (auth providers, CMSes, analytics, UI libraries, ORMs, hosting platforms), the vendor maintains a Next.js quickstart or starter that is fresher and more accurate than anything we used to ship here.
4. **Check the Vercel templates gallery.** Product-shaped starters increasingly live there rather than in this directory.

If the missing example is one you would have used and you are willing to maintain it on an ongoing basis, see the submission criteria above and open a PR.
