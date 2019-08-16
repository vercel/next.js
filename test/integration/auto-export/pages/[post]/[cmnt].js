import { useRouter } from 'next/router'

if (typeof window !== 'undefined') {
  window.caughtWarns = []
  const origWarn = window.console.warn
  const origError = window.console.error
  window.console.warn = function (...args) {
    window.caughtWarns.push(1)
    origWarn(...args)
  }
  window.console.error = function (...args) {
    window.caughtWarns.push(1)
    origError(...args)
  }
}

export default () => {
  const { query, asPath } = useRouter()
  const { cmnt } = query
  return <p>{cmnt || asPath}</p>
}
