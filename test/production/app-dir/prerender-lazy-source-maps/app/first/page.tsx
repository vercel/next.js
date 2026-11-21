function logError() {
  // Reports whether Node.js source maps are enabled in the prerender worker.
  console.error(
    new Error(
      `logged prerender error (sourceMapsEnabled: ${process.sourceMapsEnabled})`
    )
  )
}

function throwError(): never {
  throw new Error('thrown prerender error')
}

function Inner() {
  // The first error formatted in the worker, then a second one.
  logError()
  throwError()
  return null
}

export default function Page() {
  return <Inner />
}
