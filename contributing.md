# Contributing to Next.js

Our Commitment to Open Source can be found [here](https://zeit.co/blog/oss)

1. [Fork](https://help.github.com/articles/fork-a-repo/) this repository to your own GitHub account and then [clone](https://help.github.com/articles/cloning-a-repository/) it to your local device.
2. Install yarn: `npm install -g yarn`
3. Install the dependencies: `yarn`
4. Run `yarn run dev` to build and watch for code changes
5. The development branch is `canary`. On a release, the relevant parts of the changes in the `canary` branch are rebased into `master`.

## To run tests

Running all tests:

```sh
yarn testonly
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

The correct path to the compiled `next` binary can be discovered by running:

```sh
find . -name next -perm -u=x -type f
```

Running examples can be done with:

```sh
./packages/next/dist/bin/next ./test/integration/basic
# OR
./packages/next/dist/bin/next ./examples/basic-css/
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
