import { useRouter } from 'next/router'

if (typeof window !== 'undefined') {
  window.caughtWarns = []
  const origWarn = window.console.warn
  const origError = window.console.error
  window.console.warn = function (...args) {
    window.caughtWarns.push(args)
    origWarn(...args)
  }
  window.console.error = function (...args) {
    window.caughtWarns.push(args)
    origError(...args)
  }
  window.pathnames = []
}

export default function Page() {
  if (typeof window !== 'undefined') {
    window.pathnames.push(window.location.pathname)

    if (window.location.pathname.includes('hydrate-error')) {
      return <p>hydration error</p>
    }
  }
  // eslint-disable-next-line
  return <p>{useRouter().asPath}</p>
}
