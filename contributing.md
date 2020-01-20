# Contributing to Next.js

Our Commitment to Open Source can be found [here](https://zeit.co/blog/oss)

1. [Fork](https://help.github.com/articles/fork-a-repo/) this repository to your own GitHub account and then [clone](https://help.github.com/articles/cloning-a-repository/) it to your local device.
2. Create a new branch `git checkout -b MY_BRANCH_NAME`
3. Install yarn: `npm install -g yarn`
4. Install the dependencies: `yarn`
5. Run `yarn dev` to build and watch for code changes
6. In a new terminal, run `yarn types` to compile declaration files from TypeScript
7. The development branch is `canary` (this is the branch pull requests should be made against). On a release, the relevant parts of the changes in the `canary` branch are rebased into `master`.

> You may need to run `yarn types` again if your types get outdated.

To contribute to [our examples](examples), take a look at the [“Adding examples” section](#adding-examples).

## To run tests

Make sure you have `chromedriver` installed for your Chrome version. You can install it with

- `brew cask install chromedriver` on Mac OS X
- `chocolatey install chromedriver` on Windows
- Or manually downloading it from the [chromedriver repo](https://chromedriver.storage.googleapis.com/index.html) and adding the binary to `<next-repo>/node_modules/.bin`

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

Running just one test in the `production` test suite:

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
- Remove the `Deploy your own` section if your example can’t be immediately deployed to ZEIT Now.

````markdown
# Example Name

Description

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/DIRECTORY_NAME)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example DIRECTORY_NAME DIRECTORY_NAME-app
# or
yarn create next-app --example DIRECTORY_NAME DIRECTORY_NAME-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/DIRECTORY_NAME
cd DIRECTORY_NAME
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```
````
