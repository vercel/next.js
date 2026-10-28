# Programming over metaprogramming

rule: Prefer plain functions, flow control written in order, and concrete data over callbacks that invert control, handler tables, generic helpers that each case configures, or code generation.

severity: comment. Usually non-blocking.

## Signs in review

- Callbacks or closures used to defer or invert control flow that could be written in order: `onDone`, `onError`, and `beforeX` hooks passed down so a callee can call back into its caller
- A table of callbacks keyed by type, where a `switch` would do
- A generic helper with options objects that each caller configures differently
- Codegen for something a few plain functions would cover

## Example

Bad: the caller hands the callee closures, so the order of operations is only visible by tracing the callbacks:

```ts
function renderRoute(
  req: Request,
  hooks: {
    onShellReady: (shell: Stream) => void
    onError: (err: unknown) => void
    shouldPostpone: () => boolean
  }
) {
  // ...calls hooks.* from several places
}

renderRoute(req, {
  onShellReady: (shell) => res.write(shell),
  onError: (err) => (status = 500),
  shouldPostpone: () => isPrerender && !hasDynamicData,
})
```

Good: the callee returns what happened, and the caller decides, in order:

```ts
const result = await renderRoute(req)
if (result.kind === 'error') {
  status = 500
} else if (isPrerender && !result.hasDynamicData) {
  return postpone(result)
}
res.write(result.shell)
```

More examples:

- A table of handlers keyed by type, where a `switch` with `kind satisfies never` would do
- One generic helper with `transform` and `shouldX` options that each caller configures differently, where each caller could have a small function of its own
- Code generation or a build-time macro for something a few plain functions would cover

## Why

Plain code is easier to read, trace, and optimize.
