# Testing

See the [testing readme](../..//test/readme.md) for information on writing tests.

### Running tests

We recommend running the tests in headless mode (with the browser windows hidden) and wih a specific directory pattern (`--testPathPattern`) or test name (`-t`) which ensure only a small part of the test suite is run locally:

For example running one test in the production test suite:

````
Running one test in the `test/integration/production` test suite:

```sh
pnpm test --testPathPattern "test/integration/production" -t "should allow etag header support"
````

Running all tests in the `test/integration/production` test suite:

```sh
pnpm test --testPathPattern "test/integration/production"
```

Running all tests (⚠️ not recommended locally):

```sh
pnpm test
```

When you want to debug a particular tests you can replace `pnpm test` with `pnpm testonly` to opt-out of the headless browser.
When the test runs it will open the browser that is in the background by default, allowing you to inspect what is on the screen.

```sh
pnpm testonly --testPathPattern "test/integration/production" -t "should allow etag header support"
```
