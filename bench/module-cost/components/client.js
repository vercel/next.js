'use client'

import { useEffect, useState } from 'react'
import { format, measure } from '../lib/measure'

function log(result) {
  console.log(format(result))
}

async function measureClientButton(element, name, fn) {
  if (element.textContent.includes('Loading time')) {
    return
  }

  const result = await measure(name, fn)

  element.textContent = format(result)
  log(result)
}

async function measureActionButton(element, action) {
  if (element.textContent.includes('Loading time')) {
    return
  }

  const result = await action()

  element.textContent = format(result)
  log(result)
}

async function measureApiButton(element, url) {
  if (element.textContent.includes('Loading time')) {
    return
  }

  const result = await fetch(url).then((res) => res.json())

  element.textContent = format(result)
  log(result)
}

export function Client({ prefix, commonjsAction, esmAction }) {
  const [runtime, setRuntime] = useState('')
  useEffect(() => {
    setRuntime(globalThis.TURBOPACK ? 'Turbopack' : 'Webpack')
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
            onClick={(e) => measureActionButton(e.target, commonjsAction)}
          >
            CommonJs server action
          </button>
        </p>
      )}
      {esmAction && (
        <p>
          <button
            type="button"
            onClick={(e) => measureActionButton(e.target, esmAction)}
          >
            ESM server action
          </button>
        </p>
      )}
      <p>
        <button
          type="button"
          onClick={(e) => measureApiButton(e.target, `${prefix}/commonjs`)}
        >
          CommonJs API
        </button>
      </p>
      <p>
        <button
          type="button"
          onClick={(e) => measureApiButton(e.target, `${prefix}/esm`)}
        >
          ESM API
        </button>
      </p>
    </>
  )
}
