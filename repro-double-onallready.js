// Reproduction: React Fizz `onAllReady` fires twice
//
// Root cause: In finishedTask(), when boundary.pendingTasks reaches 0,
// fallbackAbortableTasks.forEach(abortTaskSoft) is called. abortTaskSoft
// calls finishedTask recursively. The inner finishedTask decrements
// allPendingTasks to 0 and calls completeAll/onAllReady. The outer
// finishedTask also sees allPendingTasks === 0 and calls completeAll again.
//
// This happens when the content task is processed BEFORE the fallback task
// in the same performWork loop. The content task completes, the boundary
// completes, abortTaskSoft is called on the still-pending fallback task.
//
// For the content task to be at a lower index than the fallback task in
// pingedTasks, the content's thenable must resolve synchronously during
// renderNode's .then(ping, ping) call, pushing the content task BEFORE
// the fallback task is created.

const React = require('react')
const { renderToPipeableStream } = require('react-dom/server')
const { PassThrough } = require('stream')

// Create a custom thenable that resolves synchronously
// (calls .then callback immediately, unlike Promises which always defer)
function createSyncThenable(value) {
  const thenable = {
    status: 'pending',
    value: undefined,
    then(resolve) {
      // Resolve synchronously!
      thenable.status = 'fulfilled'
      thenable.value = value
      resolve(value)
    },
  }
  return thenable
}

const syncThenable = createSyncThenable('hello world')

let throwCount = 0
function AsyncContent() {
  if (syncThenable.status === 'fulfilled') {
    return React.createElement('div', null, 'Content: ' + syncThenable.value)
  }
  throwCount++
  console.log(`[repro] AsyncContent throw #${throwCount}`)
  throw syncThenable
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

console.log('[repro] Starting renderToPipeableStream...')

const pipeable = renderToPipeableStream(React.createElement(App), {
  onShellReady() {
    shellReadyCount++
    console.log(`[repro] onShellReady #${shellReadyCount}`)
  },
  onAllReady() {
    allReadyCount++
    console.log(`[repro] onAllReady #${allReadyCount}`)
    console.trace('[repro] onAllReady')
    if (allReadyCount === 1) {
      const pt = new PassThrough()
      pipeable.pipe(pt)
      let html = ''
      pt.on('data', (chunk) => (html += chunk))
      pt.on('end', () => console.log('[repro] HTML:', html.substring(0, 200)))
    }
  },
  onError(err) {
    console.log('[repro] onError', err)
  },
})

setTimeout(() => {
  console.log(
    `\n[repro] Final: shellReady=${shellReadyCount} allReady=${allReadyCount}`
  )
  if (allReadyCount > 1) {
    console.log(
      '[repro] *** BUG REPRODUCED: onAllReady fired multiple times! ***'
    )
  } else {
    console.log('[repro] No double fire detected')
  }
  process.exit(0)
}, 2000)
