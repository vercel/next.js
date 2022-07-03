# Contributing to Next.js

[Watch the 40-minute walkthrough video on how to contribute to Next.js.](https://www.youtube.com/watch?v=cuoNzXFLitc)

---

- Read about our [Commitment to Open Source](https://vercel.com/oss).
- To contribute to [our examples](examples), please see [Adding examples](#adding-examples) below.
- Before jumping into a PR be sure to search [existing PRs](https://github.com/vercel/next.js/pulls) or [issues](https://github.com/vercel/next.js/issues) for an open or closed item that relates to your submission.

## Developing

The development branch is `canary`. This is the branch that all pull
requests should be made against. The changes on the `canary`
branch are published to the `@canary` tag on npm regularly.

To develop locally:

1. [Fork](https://help.github.com/articles/fork-a-repo/) this repository to your
   own GitHub account and then
   [clone](https://help.github.com/articles/cloning-a-repository/) it to your local device.

   If you don't need the whole git history, you can clone with depth 1 to reduce the download size (~1.6GB):

   ```sh
   git clone --depth=1 https://github.com/vercel/next.js
   ```

2. Create a new branch:
   ```
   git checkout -b MY_BRANCH_NAME
   ```
3. Install pnpm:
   ```
   npm install -g pnpm
   ```
4. Install the dependencies with:
   ```
   pnpm install
   ```
5. Start developing and watch for code changes:
   ```
   pnpm dev
   ```
6. In a new terminal, run `pnpm types` to compile declaration files from
   TypeScript.

   _Note: You may need to repeat this step if your types get outdated._

For instructions on how to build a project with your local version of the CLI,
see **[Developing with your local version of Next.js](#developing-with-your-local-version-of-nextjs)**
below. (Naively linking the binary is not sufficient to develop locally.)

## Building

You can build the project, including all type definitions, with:

```bash
pnpm build
# - or -
pnpm prepublishOnly
```

By default the latest canary of the next-swc binaries will be installed and used. If you are actively working on Rust code or you need to test out the most recent Rust code that hasn't been published as a canary yet you can [install Rust](https://www.rust-lang.org/tools/install) and run `pnpm --filter=@next/swc build-native`.

If you want to test out the wasm build locally, you will need to [install wasm-pack](https://rustwasm.github.io/wasm-pack/installer/). Run `pnpm --filter=@next/swc build-wasm --target <wasm_target>` to build and `node ./scripts/setup-wasm.mjs` to copy it into your `node_modules`. Run next with `NODE_OPTIONS='--no-addons'` to force it to use the wasm binary.

If you need to clean the project for any reason, use `pnpm clean`.

## Testing

See the [testing readme](./test/readme.md) for information on writing tests.

### Running tests

```sh
pnpm testonly
```

If you would like to run the tests in headless mode (with the browser windows hidden) you can do

```sh
pnpm testheadless
```

Running a specific test suite (e.g. `production`) inside of the `test/integration` directory:

```sh
pnpm testonly --testPathPattern "production"
```

Running one test in the `production` test suite:

```sh
pnpm testonly --testPathPattern "production" -t "should allow etag header support"
```

### Linting

To check the formatting of your code:

```sh
pnpm lint
```

If you get errors, you can fix them with:

```sh
pnpm lint-fix
```

### Running the example apps

Running examples can be done with:

```sh
pnpm next ./examples/basic-css/
```

To figure out which pages are available for the given example, you can run:

```sh
EXAMPLE=./test/integration/basic
(\
  cd $EXAMPLE/pages; \
  find . -type f \
  | grep -v '\.next' \
  | sed 's#^\.##' \
  | sed 's#index\.js##' \
  | sed 's#\.js$##' \
  | xargs -I{} echo localhost:3000{} \
)
```

## Developing with your local version of Next.js

There are two options to develop with your local version of the codebase:

### Set as a local dependency in package.json

1. In your app's `package.json`, replace:

   ```json
   "next": "<next-version>",
   ```

   with:

   ```json
   "next": "file:/path/to/next.js/packages/next",
   ```

2. In your app's root directory, make sure to remove `next` from `node_modules` with:

   ```sh
   rm -rf ./node_modules/next
   ```

3. In your app's root directory, run:

   ```sh
   pnpm i
   ```

   to re-install all of the dependencies.

   Note that Next will be copied from the locally compiled version as opposed to from being downloaded from the NPM registry.

4. Run your application as you normally would.

5. To update your app's dependencies, after you've made changes to your local `next` repository. In your app's root directory, run:

   ```sh
   pnpm install --force
   ```

#### Troubleshooting

- If you see the below error while running `pnpm dev` with next:

```
Failed to load SWC binary, see more info here: https://nextjs.org/docs/messages/failed-loading-swc
```

Try to add the below section to your `package.json`, then run again

```json
"optionalDependencies": {
  "@next/swc-linux-x64-gnu": "canary",
  "@next/swc-win32-x64-msvc": "canary",
  "@next/swc-darwin-x64": "canary",
  "@next/swc-darwin-arm64": "canary"
},
```

### Develop inside the monorepo

1. Move your app inside of the Next.js monorepo.

2. Run with `pnpm next-with-deps ./app-path-in-monorepo`

This will use the version of `next` built inside of the Next.js monorepo and the
main `pnpm dev` monorepo command can be running to make changes to the local
Next.js version at the same time (some changes might require re-running `pnpm next-with-deps` to take effect).

## Updating documentation paths

Our documentation currently leverages a [manifest file](/docs/manifest.json) which is how documentation entries are checked.

When adding a new entry under an existing category you only need to add an entry with `{title: '', path: '/docs/path/to/file.md'}`. The "title" is what is shown on the sidebar.

When moving the location/url of an entry the "title" field can be removed from the existing entry and the ".md" extension removed from the "path", then a "redirect" field with the shape of `{permanent: true/false, destination: '/some-url'}` can be added. A new entry should be added with the "title" and "path" fields if the document was renamed within the [`docs` folder](/docs) that points to the new location in the folder e.g. `/docs/some-url.md`

Example of moving documentation file:

Before:

```json
[
  {
    "path": "/docs/original.md",
    "title": "Hello world"
  }
]
```

After:

```json
[
   {
      "path": "/docs/original",
      "redirect": {
         "permanent": false,
         "destination": "/new"
      }
   }
   {
      "path": "/docs/new.md",
      "title": "Hello world"
   },
]
```

Note: the manifest is checked automatically in the "lint" step in CI when opening a PR.

## Adding warning/error descriptions

In Next.js we have a system to add helpful links to warnings and errors.

This allows for the logged message to be short while giving a broader description and instructions on how to solve the warning/error.

In general, all warnings and errors added should have these links attached.

Below are the steps to add a new link:

1. Run `pnpm new-error` which will create the error document and update the manifest automatically.
2. Add the following url to your warning/error:
   `https://nextjs.org/docs/messages/<file-path-without-dotmd>`.

   For example, to link to `errors/api-routes-static-export.md` you use the url:
   `https://nextjs.org/docs/messages/api-routes-static-export`

## Adding examples

When you add an example to the [examples](examples) directory, please follow these guidelines to ensure high quality examples:

- TypeScript should be leveraged for new examples (no need for separate JavaScript and TypeScript examples)
- Examples should not add custom ESLint configuration (we have specific templates for ESLint)
- If API routes aren't used in an example, they should be omitted
- If an example exists for a certain library and you would like to showcase a specific feature of that library, the existing example should be updated (instead of adding a new example)
- Package manager specific config should not be added (e.g. `resolutions` in `package.json`)
- In `package.json` the version of `next` (and `eslint-config-next`) should be `latest`
- In `package.json` the dependency versions should be up-to-date

Also don’t forget to add a `README.md` file with the following format:

- Replace `DIRECTORY_NAME` with the directory name you’re adding.
- Fill in `Example Name` and `Description`.
- Examples should be TypeScript first, if possible.
- Omit the `name` and `version` fields from your `package.json`.
- Ensure all your dependencies are up to date.
- Ensure you’re using [`next/image`](https://nextjs.org/docs/api-reference/next/image).
- To add additional installation instructions, please add it where appropriate.
- To add additional notes, add `## Notes` section at the end.
- Remove the `Deploy your own` section if your example can’t be immediately deployed to Vercel.

````markdown
# Example Name

Description

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/DIRECTORY_NAME&project-name=DIRECTORY_NAME&repository-name=DIRECTORY_NAME)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example DIRECTORY_NAME DIRECTORY_NAME-app
# or
yarn create next-app --example DIRECTORY_NAME DIRECTORY_NAME-app
# or
pnpm create next-app --example DIRECTORY_NAME DIRECTORY_NAME-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
````

## Publishing

Repository maintainers can use `yarn publish-canary` to publish a new version of all packages to npm.

## Triaging

Repository maintainers triage every issue and PR opened in the repository.

Issues are opened with one of these labels:

- `template: story` - a feature request, converted to an [💡 Ideas discussion](https://github.com/vercel/next.js/discussions/categories/ideas)
- `template: bug` - unverified issue with Next.js itself, or one of the examples in the [`examples`](https://github.com/vercel/next.js/tree/canary/examples) folder
- `template: documentation` - feedback for improvement or an unverified issue with the Next.js documentation

In case of a bug report, a maintainer looks at the provided reproduction. If the reproduction is missing or insufficient, a `please add a complete reproduction` label is added. If a reproduction is not provided for more than 30 days, the issue becomes stale and will be automatically closed. If a reproduction is provided within 30 days, the `please add a complete reproduction` label is removed and the issue will not become stale anymore.

Bug reports must be verified against the `next@canary` release. The canary version of Next.js ships daily and includes all features and fixes that have not been released to the stable version yet. Think of canary as a public beta. Some issues may already be fixed in the canary version, so please verify that your issue reproduces before opening a new issue. Issues not verified against `next@canary` will be closed after 30 days.

If the issue is specific to the project and not to Next.js itself, it might be converted to a [🎓️ Help discussion](https://github.com/vercel/next.js/discussions/categories/help)

If the bug is verified, it will receive the `kind: bug` label and will be tracked by the maintainers. An `area:` label can be added to indicate which part of Next.js is affected.

Confirmed issues never become stale or be closed before resolution.

All **closed** PRs and Issues will be locked after 30 days of inactivity (eg.: comment, referencing from elsewhere).
