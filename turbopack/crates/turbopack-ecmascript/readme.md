# turbopack-ecmascript

## Adding new parser tests

We use a snapshot-based testing system to ensure that changes to the parser don't break existing code.
To add a new test, you need to create a new directory in `tests/analyzer/graph` with an 'input.js' file
inside.

The snapshot tests are done with the `testing` crate. You can update them by passing the env var
`UPDATE=1` to the test runner.

```sh
UPDATE=1 cargo test -p turbopack-ecmascript
```
