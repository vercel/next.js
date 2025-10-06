# turbopack-tests

An extracted create to perform snapshot tests on turbopack.

## Testing

It's possible to only run the snapshot tests using [nextest][]'s filter
expressions:

```bash
cargo nextest run -E 'test(snapshot)'
```

The filter supports any substring, and only test names which contain
that substring will run.

## Updating Snapshot

If you've made a change that requires many snapshot updates, you can
automatically update all outputs using the `UPDATE` command line env:

```bash
UPDATE=1 cargo nextest run -E 'test(snapshot)'
```

[nextest]: https://nexte.st/
