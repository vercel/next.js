# No symptom patches

rule: A subtle bug (a race, a leak, a stale cache entry, a lost wakeup) is fixed at its cause, not made rarer.

severity: escalate (strong)

## Signs in review

In runtime code (not tests):

- A `setTimeout`, longer wait, extra `await`, or retry added to make a failure go away
- Reading a value once instead of twice, or caching it, with no account of the race
- A `try/catch` that swallows the error the bug produced
- A fix with no explanation, from the code, of why the code believed what it did

## Example

Bad:

```ts
// The stream sometimes closes before the last chunk is flushed.
await new Promise((resolve) => setTimeout(resolve, 50))
controller.close()
```

Good: find what orders the two, and wait on that.

```ts
// close() raced the final enqueue because the render's onAllReady fires
// before its last chunk is written. Wait for the write to finish instead.
await pendingWrite
controller.close()
```

## Why

A subtle bug means the model of the code around it is wrong somewhere. A patch that makes the symptom rarer leaves that wrong model in place, and the bug comes back under load.
