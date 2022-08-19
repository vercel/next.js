# Testing

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
