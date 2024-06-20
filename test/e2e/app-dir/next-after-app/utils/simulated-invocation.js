import { requestAsyncStorage } from 'next/dist/client/components/request-async-storage.external'
import { AwaiterOnce } from 'next/dist/server/lib/awaiter'
import { cliLog } from './log'

// replaced in tests
const shouldInstallShutdownHook = false

/*
This module is meant to help simulate a serverless invocation, which will shut down when
- the response is finished
- all promises passed to waitUntil are settled
this turns out to be a bit tricky, so here's an explanation of how this works.

We need two pieces:

1. `injectRequestContext` - the "waitUntil" part
this injects a mock-ish '@next/request-context' that provides a `waitUntil`
that collects the promises passed to it in an `Awaiter`, so that we can await them later, before exiting.
(we need to call this in instrumentation.ts, because base-server accesses `waitUntil` it before render.)

2. `installInvocationShutdownHook` - the "when the response is finished" part
registers an `onClose` callback that will await the promises passed to `waitUntil`,
and then shut down the process.
(this can only be called during render/[handing a request], because we need `onClose` to be available)


These two pieces are connected via `globalThis[Symbol.for("invocation-context")]`.
This leads to a tricky situation when we're running a handler with `runtime = "edge"`.
In tests/localhost, those handlers will be called in an EdgeRuntime sandbox (see `runEdgeFunction`),
and won't have direct access to the `globalThis` of the "outer" nodejs process.

So for edge, the flow goes like this:

1. The "outer" node server starts, and runs `instrumentation.ts`
   (injecting our 'invocation-context' that contains the "outer" `waitUntil`)

2. The outer server gets a request, and runs the edge handler
   (wrapped with `server/web/adapter`) inside `runEdgeFunction`, i.e. in an EdgeRuntime sandbox.

   and then, within the sandbox:

  3. `server/web/adapter` creates an "inner" `waitUntil` (see `NextFetchEvent.waitUntil`).
     This is what `unstable_after` calls will use.
     Notably, `adapter`'s `waitUntil` doesn't do much on its own --
     it only collects the promises, which `adapter` then returns as part of a FetchEventResult,
     expecting its caller to pass them to a "real" `waitUntil`.
     I'm not sure why this inversion exists, but that's what it does.
     
  4. the edge handler creates an "inner" NextWebServer
     - NOTE: this ALSO runs `instrumentation.ts`, so we need to make sure that
       we don't create a second '@next/request-context' here
       
  5. Rendering (or other request handling) happens within the sandbox.
  
  6. During render, we install the shutdown hook, and will call it in onClose.

     - NOTE: as outlined above, `installInvocationShutdownHook` runs in the edge sandbox,
       but it needs to access the "outer" globalThis.
     - NOTE 2: we also need to be able to call `process.exit` from here,
       which means that `invocationContext.shutdownHook` has to be passed in from the nodejs runtime --
       otherwise, edge compilation will replace it with a stub that calls `throwUnsupportedAPIError`.

  7. the render hadnler returns a Response. `adapter` takes it and the promises passed to the inner `waitUntil`
      and puts them on a FetchEventResult.
     - NOTE: **no calls to the "outer" `waitUntil` occurred yet!** 
       all that happened is that `adapter`'s Awaiter collected them.

8. The "outer" server gets back the FetchEventResult, and passes the promise from that to the "outer" waitUntil.
   This finally puts a promise into the Awaiter we created in `injectRequestContext`.
   
9. The response finishes, and `onClose` calls the shutdown hook (from inside the edge sandbox).
   we await the single promise that got added to the awaiter, and finally shutdown the process.

*/

function createInvocationContext() {
  const awaiter = new AwaiterOnce()

  const waitUntil = (promise) => {
    awaiter.waitUntil(promise)
  }

  const shutdownHook = async () => {
    cliLog(`Request finished, waiting for \`waitUntil\` promises`)
    await awaiter.awaiting()
    cliLog('simulated-invocation :: end')
    process.exit(0)
  }

  return { awaiter, waitUntil, shutdownHook }
}

const INVOCATION_CONTEXT = Symbol.for('invocation-context')

/** Install a '@next/request-context' that will collect promises passed to `waitUntil` */
export function injectRequestContext() {
  // if we're in a edge runtime sandbox, skip installing --
  // we already installed this "outside", in the nodejs runtime.
  // (and process.exit won't work anyway)
  if (process.env.NEXT_RUNTIME === 'edge' && getOuterGlobalThisInSandbox()) {
    return
  }

  const globalThis = resolveGlobalThis()

  if (globalThis[INVOCATION_CONTEXT]) {
    throw new Error('Cannot call `injectRequestContext` twice')
  }

  const invocationContext = createInvocationContext()

  /** @type {import('next/dist/server/after/builtin-request-context').BuiltinRequestContext} */
  globalThis[Symbol.for('@next/request-context')] = {
    get() {
      return {
        waitUntil: invocationContext.waitUntil,
      }
    },
  }
  globalThis[INVOCATION_CONTEXT] = invocationContext
}

export function maybeInstallInvocationShutdownHook() {
  if (!shouldInstallShutdownHook) {
    return
  }
  installInvocationShutdownHook()
}

/** Schedule a shutdown when the response is done and all `waitUntil` promises settled */
export function installInvocationShutdownHook() {
  const globalThis = resolveGlobalThis()
  const context = globalThis[INVOCATION_CONTEXT]

  if (!context) {
    throw new Error('Missing invocation context')
  }

  onClose(() => {
    context.shutdownHook()
  })
}

function onClose(/** @type {() => void} */ callback) {
  // this is a hack, but we don't want to do this with an after()
  // because that'll call `waitUntil` and affect what we're trying to test here
  const store = requestAsyncStorage.getStore()
  if (!store) {
    throw new Error('Could not access request store')
  }
  const ctx = store.afterContext
  // AfterContextImpl has an `onClose` property, it's just not exposed on the interface
  if (typeof ctx?.['onClose'] !== 'function') {
    throw new Error('Could not access `onClose` from afterContext')
  }
  return ctx['onClose'](callback)
}

/** Get the real `globalThis`, regardless if we're in the actual server or an edge sandbox. */
const resolveGlobalThis = () => {
  if (process.env.NEXT_RUNTIME === 'edge') {
    const obj = getOuterGlobalThisInSandbox()
    if (!obj) {
      throw new Error('__next_outer_globalThis__ is not defined')
    }
    return obj
  }

  // eslint-disable-next-line no-undef
  const _globalThis = globalThis
  return _globalThis
}

const getOuterGlobalThisInSandbox = () => {
  // eslint-disable-next-line no-undef
  const _globalThis = globalThis
  return _globalThis.__next_outer_globalThis__
}
