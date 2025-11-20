import { InvariantError } from '../../shared/lib/invariant-error'

/*
==========================
| Background             |
==========================

Node.js does not guarantee that two timers scheduled back to back will run
on the same iteration of the event loop:

```ts
setTimeout(one, 0)
setTimeout(two, 0)
```

Internally, each timer is assigned a `_idleStart` property that holds
an internal libuv timestamp in millisecond resolution.
This will be used to determine if the timer is already "expired" and should be executed.
However, even in sync code, it's possible for two timers to get different `_idleStart` values.
This can cause one of the timers to be executed, and the other to be delayed until the next timer phase.

The delaying happens [here](https://github.com/nodejs/node/blob/c208ffc66bb9418ff026c4e3fa82e5b4387bd147/lib/internal/timers.js#L556-L564).
and can be debugged by running node with `NODE_DEBUG=timer`.

The easiest way to observe it is to run this program in a loop until it exits with status 1:

```
// test.js

let immediateRan = false
const t1 = setTimeout(() => {
  console.log('timeout 1')
  setImmediate(() => {
    console.log('immediate 1')
    immediateRan = true
  })
})

const t2 = setTimeout(() => {
  console.log('timeout 2')
  if (immediateRan) {
    console.log('immediate ran before the second timeout!')
    console.log(
      `t1._idleStart: ${t1._idleStart}, t2_idleStart: ${t2._idleStart}`
    );
    process.exit(1)
  }
})
```

```bash
#!/usr/bin/env bash

i=1;
while true; do
  output="$(NODE_DEBUG=timer node test.js 2>&1)";
  if [ "$?" -eq 1 ]; then
    echo "failed after $i iterations";
    echo "$output";
    break;
  fi;
  i=$((i+1));
done
```

If `t2` is deferred to the next iteration of the event loop,
then the immediate scheduled from inside `t1` will run first.
When this occurs, `_idleStart` is reliably different between `t1` and `t2`.

==========================
| Solution               |
==========================

We can guarantee that multiple timers (with the same delay, usually `0`)
run together without any delays by making sure that their `_idleStart`s are the same,
because that's what's used to determine if a timer should be deferred or not.
Luckily, this property is currently exposed to userland and mutable,
so we can patch it.

Another related trick we could potentially apply is making
a timer immediately be considered expired by doing  `timer._idleStart -= 2`.
(the value must be more than `1`, the delay that actually gets set for `setTimeout(cb, 0)`).
This makes node view this timer as "a 1ms timer scheduled 2ms ago",
meaning that it should definitely run in the next timer phase.
However, I'm not confident we know all the side effects of doing this,
so for now, simply ensuring coordination is enough.
*/

let shouldAttemptPatching = true

function warnAboutTimers() {
  console.warn(
    "Next.js cannot guarantee that Cache Components will run as expected due to the current runtime's implementation of `setTimeout()`.\nPlease report a github issue here: https://github.com/vercel/next.js/issues/new/"
  )
}

/**
 * Allows scheduling multiple timers (equivalent to `setTimeout(cb, delayMs)`)
 * that are guaranteed to run in the same iteration of the event loop.
 *
 * @param delayMs - the delay to pass to `setTimeout`. (default: 0)
 *
 * */
export function createAtomicTimerGroup(delayMs = 0) {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError(
      'createAtomicTimerGroup cannot be called in the edge runtime'
    )
  } else {
    let isFirstCallback = true
    let firstTimerIdleStart: number | null = null
    let didFirstTimerRun = false

    // As a sanity check, we schedule an immediate from the first timeout
    // to check if the execution was interrupted.
    let didImmediateRun = false
    function runFirstCallback(callback: () => void) {
      didFirstTimerRun = true
      if (shouldAttemptPatching) {
        setImmediate(() => {
          didImmediateRun = true
        })
      }
      return callback()
    }

    function runSubsequentCallback(callback: () => void) {
      if (shouldAttemptPatching) {
        if (didImmediateRun) {
          // If the immediate managed to run between the timers, then we're not
          // able to provide the guarantees that we're supposed to
          shouldAttemptPatching = false
          warnAboutTimers()
        }
      }
      return callback()
    }

    return function scheduleTimeout(callback: () => void) {
      if (didFirstTimerRun) {
        throw new InvariantError(
          'Cannot schedule more timers into a group that already executed'
        )
      }

      const timer = setTimeout(
        isFirstCallback ? runFirstCallback : runSubsequentCallback,
        delayMs,
        callback
      )
      isFirstCallback = false

      if (!shouldAttemptPatching) {
        // We already tried patching some timers, and it didn't work.
        // No point trying again.
        return timer
      }

      // NodeJS timers have a `_idleStart` property, but it doesn't exist e.g. in Bun.
      // If it's not present, we'll warn and try to continue.
      try {
        if ('_idleStart' in timer && typeof timer._idleStart === 'number') {
          // If this is the first timer that was scheduled, save its `_idleStart`.
          // We'll copy it onto subsequent timers to guarantee that they'll all be
          // considered expired in the same iteration of the event loop
          // and thus will all be executed in the same timer phase.
          if (firstTimerIdleStart === null) {
            firstTimerIdleStart = timer._idleStart
          } else {
            timer._idleStart = firstTimerIdleStart
          }
        } else {
          shouldAttemptPatching = false
          warnAboutTimers()
        }
      } catch (err) {
        // This should never fail in current Node, but it might start failing in the future.
        // We might be okay even without tweaking the timers, so warn and try to continue.
        console.error(
          new InvariantError(
            'An unexpected error occurred while adjusting `_idleStart` on an atomic timer',
            { cause: err }
          )
        )
        shouldAttemptPatching = false
        warnAboutTimers()
      }

      return timer
    }
  }
}
