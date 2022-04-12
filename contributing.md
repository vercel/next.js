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
3. Install yarn:
   ```
   npm install -g yarn
   ```
4. Install the dependencies with:
   ```
   yarn
   ```
5. Start developing and watch for code changes:
   ```
   yarn dev
   ```
6. In a new terminal, run `yarn types` to compile declaration files from
   TypeScript.

   _Note: You may need to repeat this step if your types get outdated._

For instructions on how to build a project with your local version of the CLI,
see **[Developing with your local version of Next.js](#developing-with-your-local-version-of-nextjs)**
below. (Naively linking the binary is not sufficient to develop locally.)

## Building

You can build the project, including all type definitions, with:

```bash
yarn build
# - or -
yarn prepublish
```

By default the latest canary of the next-swc binaries will be installed and used. If you are actively working on Rust code or you need to test out the most recent Rust code that hasn't been published as a canary yet you can [install Rust](https://www.rust-lang.org/tools/install) and run `yarn --cwd packages/next-swc build-native`.

If you need to clean the project for any reason, use `yarn clean`.

## Testing

See the [testing readme](./test/readme.md) for information on writing tests.

### Running tests

```sh
yarn testonly
```

If you would like to run the tests in headless mode (with the browser windows hidden) you can do

```sh
yarn testheadless
```

Running a specific test suite (e.g. `production`) inside of the `test/integration` directory:

```sh
yarn testonly --testPathPattern "production"
```

Running one test in the `production` test suite:

```sh
yarn testonly --testPathPattern "production" -t "should allow etag header support"
```

### Linting

To check the formatting of your code:

```sh
yarn lint
```

If you get errors, you can fix them with:

```sh
yarn lint-fix
```

### Running the example apps

Running examples can be done with:

```sh
yarn next ./test/integration/basic
# OR
yarn next ./examples/basic-css/
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
   yarn
   ```

   to re-install all of the dependencies.

   Note that Next will be copied from the locally compiled version as opposed to from being downloaded from the NPM registry.

4. Run your application as you normally would.

5. To update your app's dependencies, after you've made changes to your local `next` repository. In your app's root directory, run:

   ```sh
   yarn install --force
   ```

#### Troubleshooting

- If you see the below error while running `yarn dev` with next:

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

2. Run with `yarn next-with-deps ./app-path-in-monorepo`

This will use the version of `next` built inside of the Next.js monorepo and the
main `yarn dev` monorepo command can be running to make changes to the local
Next.js version at the same time (some changes might require re-running `yarn next-with-deps` to take effect).

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

1. Run `yarn new-error` which will create the error document and update the manifest automatically.
2. Add the following url to your warning/error:
   `https://nextjs.org/docs/messages/<file-path-without-dotmd>`.

   For example, to link to `errors/api-routes-static-export.md` you use the url:
   `https://nextjs.org/docs/messages/api-routes-static-export`

## Adding examples

When you add an example to the [examples](examples) directory, don’t forget to add a `README.md` file with the following format:

- Replace `DIRECTORY_NAME` with the directory name you’re adding.
- Fill in `Example Name` and `Description`.
- Examples should be TypeScript first, if possible.
- You don’t need to add `name` or `version` in your `package.json`.
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

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example DIRECTORY_NAME DIRECTORY_NAME-app
# or
yarn create next-app --example DIRECTORY_NAME DIRECTORY_NAME-app
# or
pnpm create next-app -- --example DIRECTORY_NAME DIRECTORY_NAME-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
````

## Publishing

Repository maintainers can use `yarn publish-canary` to publish a new version of all packages to npm.
