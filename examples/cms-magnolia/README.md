# Magnolia Vercel Integration

This powerful synergy brings together Vercel's seamless deployment and scaling capabilities with Magnolia's robust full-page editing experience for Next.js projects.

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), [pnpm](https://pnpm.io), or [Bun](https://bun.sh/docs/cli/bunx) to bootstrap the example:

```bash
npx create-next-app --example cms-magnolia cms-magnolia-app
```

```bash
yarn create next-app --example cms-magnolia cms-magnolia-app
```

```bash
pnpm create next-app --example cms-magnolia cms-magnolia-app
```

```bash
bunx create-next-app --example cms-magnolia cms-magnolia-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Pages and Components

The demo contains:

-   Basic page template
-   Contact page template
-   Header component
-   Paragraph component
-   Image component
-   List component
-   Item component (available inside List component)
-   Expander component

-   Navigation component

### DAM

In order for images to be displayed:
Open the Security app, open the `Roles` tab, edit the `rest-anonymous` role, go to `Web access` tab, `Add new` with this path `/dam/*` set to GET.

In `Access control lists` tab modify `Dam` workspace by allowing `Read-only` access to `Selected and sub nodes` to `/`.

### Next.js SSR

You will need to create a root page with the `Next.js SSR: Basic` template and name it `vercel-demo`.

### Manually:

Open the `Pages` app in Magnolia and **_click Add Page_** add either

-   A `Next.js SSR: Basic` **_template_** and name it `vercel-demo`

> The page name is important as the SPA's are hardcoded to treat those names as the base of the app.
