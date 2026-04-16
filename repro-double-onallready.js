// Reproduction: React Fizz `onAllReady` callback fires twice for a single
// renderToPipeableStream call. Calling pipeable.pipe() in the second
// invocation throws "React currently only supports piping to one writable
// stream."
//
// This was discovered in Next.js during `next build` prerendering of the
// /_not-found page when using Node.js streams (renderToPipeableStream)
// with { waitForAllReady: true }, which defers pipe() to the onAllReady
// callback.
//
// ## How Fizz processes Suspense boundaries
//
// When Fizz encounters a <Suspense> boundary during rendering:
//
// 1. It tries to render the content inline (within the current task).
// 2. If a child component suspends (e.g. via use()), renderNode() catches
//    the SuspenseException internally and calls spawnNewSuspendedRenderTask()
//    to create a new task for the suspended subtree. It then attaches
//    thenable.then(ping, ping) so the task is re-queued when data arrives.
//    renderNode() returns normally — the throw does NOT propagate up.
// 3. Back in the Suspense setup code, the boundary has pendingTasks > 0
//    (from the spawned task), so a fallback task is created and pushed to
//    pingedTasks.
//
// In the normal case (async thenable, e.g. a real Promise), the sequence is:
//
//   performWork loop:
//     index 0: root task — renders tree, content suspends,
//              fallback task pushed to pingedTasks
//     index 1: fallback task — renders fallback, task.abortSet.delete(task)
//              removes it from boundary.fallbackAbortableTasks
//   performWork ends.
//   Microtask: thenable resolves → ping → content task pushed to pingedTasks
//   Next performWork: content task completes → boundary.pendingTasks = 0
//     → fallbackAbortableTasks.forEach(abortTaskSoft) iterates an EMPTY set
//     → single onAllReady ✓
//
// ## How a synchronously-resolving thenable breaks this
//
// The thenable used here resolves synchronously when .then() is called
// (unlike a real Promise, which always defers .then callbacks to a
// microtask). This changes the ordering:
//
//   During root task rendering:
//     1. renderNode encounters <Suspense>, renders content inline
//     2. use(thenable) suspends → renderNode catches SuspenseException
//     3. spawnNewSuspendedRenderTask creates content task
//     4. thenable.then(ping, ping) — ping fires SYNCHRONOUSLY
//        → content task pushed to pingedTasks (index 1)
//     5. renderNode returns to Suspense setup
//     6. boundary.pendingTasks > 0, so fallback task is created
//        → pushed to pingedTasks (index 2)
//     7. Root task finishes → pushed finishedTask
//
//   performWork loop continues:
//     index 1: content task (NOT the fallback!) — retries, use() sees the
//              thenable is now fulfilled, renders successfully.
//              → finishedTask() is called:
//                a. request.allPendingTasks-- (goes from 2 to 1)
//                b. boundary.pendingTasks-- (goes to 0 → boundary complete!)
//                c. boundary.fallbackAbortableTasks.forEach(abortTaskSoft)
//                   The fallback task is STILL in the set (hasn't been
//                   processed yet).
//                d. abortTaskSoft(fallbackTask) calls finishedTask() again:
//                   - request.allPendingTasks-- (1 → 0)
//                   - 0 === allPendingTasks → completeAll() → onAllReady #1
//                e. Back in the OUTER finishedTask (step c returned):
//                   - 0 === allPendingTasks → completeAll() → onAllReady #2
//     index 2: fallback task — already aborted, segment status is 3, skipped
//
// The root cause is that finishedTask checks `0 === request.allPendingTasks`
// at the end (after the forEach), but the nested finishedTask from
// abortTaskSoft already decremented allPendingTasks to 0 and called
// completeAll. The outer finishedTask sees the same 0 and calls
// completeAll again.
//
// ## Why this happens in Next.js
//
// In Next.js's prerenderToStream, the RSC Flight data is pre-buffered via
// createReactServerPrerenderResultFromRender and provided to Fizz as an
// "unclosing" ReadableStream (asUnclosingStream()). The Flight client
// (createFromReadableStream) processes this data into React elements. The
// internal Flight "chunk" thenables are NOT standard Promises — they call
// .then() listeners synchronously when data is already buffered, creating
// exactly the condition above.
//
// The custom thenable below simulates this behavior: it stays pending on
// the first .then() call (from use()/readThenable's status-tracking probe)
// so that use() suspends, but resolves synchronously on the second .then()
// call (from renderNode's catch block attaching .then(ping, ping)).

const React = require('react')
const { renderToPipeableStream } = require('react-dom/server')
const { PassThrough } = require('stream')

// A thenable that skips the first .then() call (React's use() status probe)
// but resolves synchronously on the second call (renderNode's ping attachment).
// This mirrors how React Flight client chunks behave when data is pre-buffered.
function createDeferredSyncThenable(value) {
  let thenCallCount = 0
  return {
    status: 'pending',
    value: undefined,
    then(resolve) {
      thenCallCount++
      if (thenCallCount > 1) {
        this.status = 'fulfilled'
        this.value = value
        resolve(value)
      }
    },
  }
}

const thenable = createDeferredSyncThenable('hello world')

function AsyncContent() {
  const value = React.use(thenable)
  return React.createElement('div', null, 'Content: ' + value)
}

function App() {
  return React.createElement(
    'html',
    null,
    React.createElement(
      'body',
      null,
      React.createElement(
        React.Suspense,
        { fallback: React.createElement('div', null, 'Loading...') },
        React.createElement(AsyncContent)
      )
    )
  )
}

let shellReadyCount = 0
let allReadyCount = 0

const pipeable = renderToPipeableStream(React.createElement(App), {
  onShellReady() {
    shellReadyCount++
    console.log(`onShellReady #${shellReadyCount}`)
  },
  onAllReady() {
    allReadyCount++
    console.log(`onAllReady #${allReadyCount}`)
    console.trace('onAllReady')
    if (allReadyCount === 1) {
      const pt = new PassThrough()
      pipeable.pipe(pt)
      let html = ''
      pt.on('data', (chunk) => (html += chunk))
      pt.on('end', () => console.log('HTML:', html.substring(0, 200)))
    }
  },
  onError(err) {
    console.log('onError', err)
  },
})

setTimeout(() => {
  console.log(
    `\nFinal: shellReady=${shellReadyCount} allReady=${allReadyCount}`
  )
  if (allReadyCount > 1) {
    console.log('BUG REPRODUCED: onAllReady fired multiple times')
  } else {
    console.log('No double fire detected')
  }
  process.exit(0)
}, 2000)
