# Running Example Apps

Running examples can be done with:

```sh
pnpm next-with-deps ./examples/basic-css/
```

> Before you can run the example, you need to install all the dependencies with `pnpm i` and build the `next.js` by running `yarn build` or `pnpm run build` in the root directory.

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
