# Contributing to Next.js

Read about our [Commitment to Open Source](https://vercel.com/oss).

1. [Fork](https://help.github.com/articles/fork-a-repo/) this repository to your own GitHub account and then [clone](https://help.github.com/articles/cloning-a-repository/) it to your local device.
2. Create a new branch: `git checkout -b MY_BRANCH_NAME`
3. Install yarn: `npm install -g yarn`
4. Install the dependencies: `yarn`
5. Run `yarn dev` to build and watch for code changes
6. In a new terminal, run `yarn types` to compile declaration files from TypeScript
7. The development branch is `canary` (this is the branch pull requests should be made against). On a release, the relevant parts of the changes in the `canary` branch are rebased into `master`.

> You may need to run `yarn types` again if your types get outdated.

To contribute to [our examples](examples), take a look at the [“Adding examples” section](#adding-examples).

## Adding warning/error descriptions

In Next.js we have a system to add helpful links to warnings and errors.

This allows for the logged message to be short while giving a broader description and instructions on how to solve the warning/error.

In general all warnings and errors added should have these links attached.

Below are the steps to add a new link:

- Create a new markdown file under the `errors` directory based on `errors/template.md`: `cp errors/template.md errors/<error-file-name>.md`
- Add the newly added file to `errors/manifest.json`
- Add the following url to your warning/error: `https://nextjs.org/docs/messages/<file-path-without-dotmd>`. For example to link to `errors/api-routes-static-export.md` you use the url: `https://nextjs.org/docs/messages/api-routes-static-export`

## To run tests

Make sure you have `chromedriver` installed for your Chrome version. You can install it with

- `brew install --cask chromedriver` on Mac OS X
- `chocolatey install chromedriver` on Windows
- Or manually download the version that matches your installed chrome version (if there's no match, download a version under it, but not above) from the [chromedriver repo](https://chromedriver.storage.googleapis.com/index.html) and add the binary to `<next-repo>/node_modules/.bin`

Running all tests:

```sh
yarn testonly
```

If you would like to run the tests in headless mode (with the browser windows hidden) you can do

```sh
yarn testheadless
```

If you would like to use a specific Chrome/Chromium binary to run tests you can specify it with

```sh
CHROME_BIN='path/to/chrome/bin' yarn testonly
```

Running a specific test suite inside of the `test/integration` directory:

```sh
yarn testonly --testPathPattern "production"
```

Running one test in the `production` test suite:

```sh
yarn testonly --testPathPattern "production" -t "should allow etag header support"
```

## Running the integration apps

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

## Running your own app with locally compiled version of Next.js

1. Move your app inside of the Next.js monorepo.

2. Run with `yarn next-with-deps ./app-path-in-monorepo`

This will use the version of `next` built inside of the Next.js monorepo and the main `yarn dev` monorepo command can be running to make changes to the local Next.js version at the same time (some changes might require re-running `yarn next-with-deps` to take affect).

or

1. In your app's `package.json`, replace:

   ```json
   "next": "<next-version>",
   ```

   with:

   ```json
   "next": "file:<local-path-to-cloned-nextjs-repo>/packages/next",
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

## Adding examples

When you add an example to the [examples](examples) directory, don’t forget to add a `README.md` file with the following format:

- Replace `DIRECTORY_NAME` with the directory name you’re adding.
- Fill in `Example Name` and `Description`.
- To add additional installation instructions, please add it where appropriate.
- To add additional notes, add `## Notes` section at the end.
- Remove the `Deploy your own` section if your example can’t be immediately deployed to Vercel.
- Remove the `Preview` section if the example doesn't work on [StackBlitz](http://stackblitz.com/) and file an issue [here](https://github.com/stackblitz/webcontainer-core).

````markdown
# Example Name

Description

## Preview

Preview the example live on [StackBlitz](http://stackblitz.com/):

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/DIRECTORY_NAME)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/DIRECTORY_NAME&project-name=DIRECTORY_NAME&repository-name=DIRECTORY_NAME)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example DIRECTORY_NAME DIRECTORY_NAME-app
# or
yarn create next-app --example DIRECTORY_NAME DIRECTORY_NAME-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
````

## Publishing

Repository maintainers can use `yarn publish-canary` to publish a new version of all packages to npm.
