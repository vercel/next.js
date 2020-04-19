# Acceptance Testing

Acceptance tests provide a streamlined way for you to write automated fixtures,
and assert DOM expectations.

## Usage

First, create a collection for the acceptance behavior you'd like to check:

```
<rootDir>/COLLECTION_NAME/
```

Then, you can create multiple folders each representing a scenario you'd like
to test. These do not have to be numbered, but it's preferred for ordering:

```
<rootDir>/COLLECTION_NAME/1-BEHAVIOR-A/
<rootDir>/COLLECTION_NAME/2-BEHAVIOR-B/
<rootDir>/COLLECTION_NAME/3-BEHAVIOR-C/
```

Next, create the entrypoint for a the starting state of the behavior:

```bash
0.index.js # the entrypoint
```

This is the only required file.

Finally, you can create new "steps" of files, and assert certain expectations:

```bash
1.index.js
1.acceptance.json
2.index.js
2.acceptance.json
```

> Note: Previous versions of files are not removed between steps.
> To delete a file, create a new version of it with no contents.

Steps can change multiple files at once:

```bash
# unordered:
1.index.js
1.other.js
1.acceptance.json

# ordered:
1.1.other.js
1.2.index.js
1.acceptance.json
```

## Acceptance Actions

An `#.acceptance.json` can define the following:

### Reload Assertion

You can assert that a step did or did not cause a page reload.

By default, this behavior is not checked.

```json
{
  "didReload": false
}
```

### DOM Action

Actions can be performed before or after the DOM assertions are made.

```json
{
  "before:actions": [{ "selector": "button", "action": "click" }],
  "after:actions": [
    { "selector": "#other", "action": "click" },
    { "selector": "input", "action": "type:abc" }
  ]
}
```

### DOM Content Assertion

You can assert that DOM content equals or matches a value you provide.

```json
{
  "dom": [
    { "selector": "#h1", "toBe": "..." },
    { "selector": ".anc", "stringContaining": "..." }
  ]
}
```
