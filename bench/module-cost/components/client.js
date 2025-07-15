'use client'

import { format, measure } from '../lib/measure'

async function measureClientButton(element, name, fn) {
  if (element.textContent.includes('Loading time')) {
    return
  }

  const result = await measure(name, fn)

  element.textContent += ` (${format(result)})`
}

async function measureActionButton(element, action) {
  if (element.textContent.includes('Loading time')) {
    return
  }

  const result = await action()

  element.textContent += ` (${format(result)})`
}

async function measureApiButton(element, url) {
  if (element.textContent.includes('Loading time')) {
    return
  }

  const result = await fetch(url).then((res) => res.json())

  element.textContent += ` (${format(result)})`
}

export function Client({ prefix, commonjsAction, esmAction }) {
  return (
    <>
      <p>
        <button
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
            onClick={(e) => measureActionButton(e.target, commonjsAction)}
          >
            CommonJs server action
          </button>
        </p>
      )}
      {esmAction && (
        <p>
          <button onClick={(e) => measureActionButton(e.target, esmAction)}>
            ESM server action
          </button>
        </p>
      )}
      <p>
        <button
          onClick={(e) => measureApiButton(e.target, `${prefix}/commonjs`)}
        >
          CommonJs API
        </button>
      </p>
      <p>
        <button onClick={(e) => measureApiButton(e.target, `${prefix}/esm`)}>
          ESM API
        </button>
      </p>
    </>
  )
}
