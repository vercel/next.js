'use client'

import { format, measure } from '../lib/measure'

async function measureClientButton(element, fn) {
  if (element.textContent.includes('Loading time')) {
    return
  }

  const result = await measure(fn)

  element.textContent += ` (${format(result)})`
}

async function measureServerButton(element, url) {
  if (element.textContent.includes('Loading time')) {
    return
  }

  const result = await fetch(url).then((res) => res.json())

  element.textContent += ` (${format(result)})`
}

export function Client({ prefix }) {
  return (
    <>
      <p>
        <button
          onClick={(e) =>
            measureClientButton(e.target, () => import('../lib/commonjs.js'))
          }
        >
          CommonJs client
        </button>
      </p>
      <p>
        <button
          onClick={(e) =>
            measureClientButton(e.target, () => import('../lib/esm.js'))
          }
        >
          ESM client
        </button>
      </p>
      <p>
        <button
          onClick={(e) => measureServerButton(e.target, `${prefix}/commonjs`)}
        >
          CommonJs API
        </button>
      </p>
      <p>
        <button onClick={(e) => measureServerButton(e.target, `${prefix}/esm`)}>
          ESM API
        </button>
      </p>
    </>
  )
}
