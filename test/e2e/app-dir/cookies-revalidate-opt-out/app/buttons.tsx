'use client'

import { useState } from 'react'
import {
  setCookie,
  setCookieWithoutRevalidate,
  setCookieObjectFormWithoutRevalidate,
  deleteCookie,
  deleteCookieWithoutRevalidate,
  setCookiesMixed,
  setCookieWithoutRevalidateAndRevalidatePath,
} from './actions'

function randomValue() {
  return `${Math.random()}`.replace('.', '')
}

export function Buttons() {
  const [result, setResult] = useState('no-result')

  const run = (name: string, action: () => Promise<string>) => async () => {
    const returned = await action()
    setResult(`${name}:${returned}`)
  }

  return (
    <div>
      <p id="action-result">{result}</p>
      <button
        id="set-cookie"
        onClick={run('set-cookie', () => setCookie(randomValue()))}
      >
        set
      </button>
      <button
        id="set-cookie-without-revalidate"
        onClick={run('set-cookie-without-revalidate', () =>
          setCookieWithoutRevalidate(randomValue())
        )}
      >
        set without revalidate
      </button>
      <button
        id="set-cookie-object-form"
        onClick={run('set-cookie-object-form', () =>
          setCookieObjectFormWithoutRevalidate(randomValue())
        )}
      >
        set (object form) without revalidate
      </button>
      <button
        id="delete-cookie"
        onClick={run('delete-cookie', () => deleteCookie(randomValue()))}
      >
        delete
      </button>
      <button
        id="delete-cookie-without-revalidate"
        onClick={run('delete-cookie-without-revalidate', () =>
          deleteCookieWithoutRevalidate(randomValue())
        )}
      >
        delete without revalidate
      </button>
      <button
        id="set-cookies-mixed"
        onClick={run('set-cookies-mixed', () => setCookiesMixed(randomValue()))}
      >
        set mixed
      </button>
      <button
        id="set-cookie-and-revalidate-path"
        onClick={run('set-cookie-and-revalidate-path', () =>
          setCookieWithoutRevalidateAndRevalidatePath(randomValue())
        )}
      >
        set without revalidate + revalidatePath
      </button>
    </div>
  )
}
