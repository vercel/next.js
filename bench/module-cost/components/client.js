'use client'

import { useEffect, useRef, useState } from 'react'
import { format, measure } from '../lib/measure'

function report(result, element, textarea) {
  if (!globalThis.BENCHMARK_RESULTS) {
    globalThis.BENCHMARK_RESULTS = []
  }
  globalThis.BENCHMARK_RESULTS.push(result)

  const formattedResult = format(result)
  element.textContent += `: ${formattedResult}`
  textarea.current.value += `\n    ${formattedResult}`
  console.log(formattedResult)
  element.disabled = true
}

async function measureClientButton(element, textarea, name, fn) {
  if (element.textContent.includes('Loading time')) {
    return
  }

  const result = await measure(name, fn)
  report(result, element, textarea)
}

async function measureActionButton(element, textarea, action) {
  if (element.textContent.includes('Loading time')) {
    return
  }

  const result = await action()

  report(result, element, textarea)
}

async function measureApiButton(element, textarea, url) {
  if (element.textContent.includes('Loading time')) {
    return
  }

  const result = await fetch(url).then((res) => res.json())

  report(result, element, textarea)
}

export function Client({ prefix, commonjsAction, esmAction }) {
  const [runtime, setRuntime] = useState('')
  const textarea = useRef()
  useEffect(() => {
    setRuntime(
      `${globalThis.TURBOPACK ? 'Turbopack' : 'Webpack'} (${process.env.NODE_ENV})`
    )
  }, [])
  return (
    <>
      <h1>{runtime}</h1>
      <p>
        <button
          type="button"
          onClick={(e) =>
            measureClientButton(
              e.target,
              textarea,
              'client commonjs',
              () => import('../lib/commonjs.js')
            )
          }
        >
          CommonJs client
        </button>
      </p>
      <p>
        <button
          type="button"
          onClick={(e) =>
            measureClientButton(
              e.target,
              textarea,
              'client esm',
              () => import('../lib/esm.js')
            )
          }
        >
          ESM client
        </button>
      </p>
      {commonjsAction && (
        <p>
          <button
            type="button"
            onClick={(e) =>
              measureActionButton(e.target, textarea, commonjsAction)
            }
          >
            CommonJs server action
          </button>
        </p>
      )}
      {esmAction && (
        <p>
          <button
            type="button"
            onClick={(e) => measureActionButton(e.target, textarea, esmAction)}
          >
            ESM server action
          </button>
        </p>
      )}
      <p>
        <button
          type="button"
          onClick={(e) =>
            measureApiButton(e.target, textarea, `${prefix}/commonjs`)
          }
        >
          CommonJs API
        </button>
      </p>
      <p>
        <button
          type="button"
          onClick={(e) => measureApiButton(e.target, textarea, `${prefix}/esm`)}
        >
          ESM API
        </button>
      </p>
      {
        // holds all the timing data for easier copy paste
      }
      <textarea
        readOnly={true}
        ref={textarea}
        value={runtime}
        style={{ fieldSizing: 'content' }}
      ></textarea>
    </>
  )
}
