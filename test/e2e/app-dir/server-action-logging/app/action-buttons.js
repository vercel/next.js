'use client'

import { useState } from 'react'

export default function ActionButtons({
  successAction,
  multiArgAction,
  redirectAction,
  notFoundAction,
  errorAction,
  objectArgAction,
  arrayArgAction,
  inlineAction,
  promiseArgAction,
}) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleSuccess = async () => {
    setError(null)
    const res = await successAction(5)
    setResult(res)
  }

  const handleMultiArg = async () => {
    setError(null)
    const res = await multiArgAction(1, 2, 3)
    setResult(res)
  }

  const handleRedirect = async () => {
    setError(null)
    await redirectAction('/redirect-target')
  }

  const handleNotFound = async () => {
    setError(null)
    try {
      await notFoundAction()
    } catch (e) {
      setError('notFound triggered')
    }
  }

  const handleError = async () => {
    setError(null)
    try {
      await errorAction()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleObjectArg = async () => {
    setError(null)
    const res = await objectArgAction({ name: 'test', value: 42 })
    setResult(res)
  }

  const handleArrayArg = async () => {
    setError(null)
    const res = await arrayArgAction([1, 2, 3, 4, 5])
    setResult(res)
  }

  const handleInline = async () => {
    setError(null)
    const res = await inlineAction(10)
    setResult({ doubled: res })
  }

  const handlePromiseArg = async () => {
    setError(null)
    const res = await promiseArgAction(Promise.resolve('hello'))
    setResult(res)
  }

  return (
    <div>
      <h1>Server Action Logging Test</h1>

      <div>
        <button id="success-action" onClick={handleSuccess}>
          Success Action
        </button>
        <button id="multi-arg-action" onClick={handleMultiArg}>
          Multi Arg Action
        </button>
        <button id="redirect-action" onClick={handleRedirect}>
          Redirect Action
        </button>
        <button id="not-found-action" onClick={handleNotFound}>
          NotFound Action
        </button>
        <button id="error-action" onClick={handleError}>
          Error Action
        </button>
        <button id="object-arg-action" onClick={handleObjectArg}>
          Object Arg Action
        </button>
        <button id="array-arg-action" onClick={handleArrayArg}>
          Array Arg Action
        </button>
        <button id="inline-action" onClick={handleInline}>
          Inline Action
        </button>
        <button id="promise-arg-action" onClick={handlePromiseArg}>
          Promise Arg Action
        </button>
      </div>

      {result && <pre id="result">{JSON.stringify(result, null, 2)}</pre>}
      {error && <p id="error">{error}</p>}
    </div>
  )
}
