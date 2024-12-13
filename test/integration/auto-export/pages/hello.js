import { useRouter } from 'next/router'

if (typeof window !== 'undefined') {
  window.caughtErrors = []
  const origError = window.onerror

  window.onerror = function (...args) {
    window.caughtErrors.push(args)
    origError(...args)
  }
}

export default function () {
  return <h1>{useRouter().asPath}</h1>
}
