if (typeof window !== 'undefined') {
  window.caughtWarns = []

  const origWarn = window.console.warn
  window.console.warn = function (...args) {
    window.caughtWarns.push(args.join(' '))
    origWarn(...args)
  }
}

export default function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}
