if (typeof window !== 'undefined') {
  window.caughtWarns = []

  const origWarn = window.console.warn
  const origError = window.console.error

  window.console.warn = function (...args) {
    window.caughtWarns.push(args.join(' '))
    origWarn(...args)
  }
  window.console.error = function (...args) {
    window.caughtWarns.push(args.join(' '))
    origError(...args)
  }
}

export default function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}
