## Adding examples

When you add an example to the [examples](https://github.com/vercel/next.js/tree/canary/examples) directory, please follow these guidelines to ensure high-quality examples:

- TypeScript should be leveraged for new examples (no need for separate JavaScript and TypeScript examples, converting old JavaScript examples is preferred)
- Examples should not add custom ESLint configuration (we have specific templates for ESLint)
- If API routes aren't used in an example, they should be omitted
- If an example exists for a certain library and you would like to showcase a specific feature of that library, the existing example should be updated (instead of adding a new example)
- Package manager specific config should not be added (e.g. `resolutions` in `package.json`)
- In `package.json` the version of `next` should be `latest`
- In `package.json` the dependency versions should be up-to-date
- Use `export default function` for page components and API Routes instead of `const`/`let` (The exception is if the page has `getInitialProps`, in which case [`NextPage`](https://nextjs.org/docs/api-reference/data-fetching/get-initial-props#typescript) could be useful)
- CMS example directories should be prefixed with `cms-`
- Example directories should not be prefixed with `with-`
- Make sure linting passes (you can run `pnpm build && pnpm lint` to verify and `pnpm lint-fix` for automatic fixes)

Also, don’t forget to add a `README.md` file with the following format:

- Replace `DIRECTORY_NAME` with the directory name you’re adding.
- Fill in `Example Name` and `Description`.
- Examples should be TypeScript first, if possible.
- Omit the `name` and `version` fields from your `package.json`.
- Ensure all your dependencies are up to date.
- Ensure you’re using [`next/image`](https://nextjs.org/docs/api-reference/next/image).
- To add additional installation instructions, please add them where appropriate.
- To add additional notes, add `## Notes` section at the end.
- Remove the `Deploy your own` section if your example can’t be immediately deployed to Vercel.

````markdown
# Example Name

Description

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/DIRECTORY_NAME&project-name=DIRECTORY_NAME&repository-name=DIRECTORY_NAME)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), [pnpm](https://pnpm.io), or [Bun](https://bun.sh/docs/cli/bunx) to bootstrap the example:

```bash
npx create-next-app --example DIRECTORY_NAME DIRECTORY_NAME-app
```

```bash
yarn create next-app --example DIRECTORY_NAME DIRECTORY_NAME-app
```

```bash
pnpm create next-app --example DIRECTORY_NAME DIRECTORY_NAME-app
```

```bash
bunx create-next-app --example DIRECTORY_NAME DIRECTORY_NAME-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
````
