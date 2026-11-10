if (typeof window !== 'undefined') {
  window.caughtWarns = []

  const origWarn = window.console.warn
  const origError = window.console.error

  const isHmrNoise = (msg) =>
    msg.includes('[HMR]') ||
    msg.includes('handleStaticIndicator') ||
    msg.includes('isrManifest')

  window.console.warn = function (...args) {
    const msg = args.join(' ')
    if (!isHmrNoise(msg)) {
      window.caughtWarns.push(msg)
    }
    origWarn(...args)
  }
  window.console.error = function (...args) {
    const msg = args.join(' ')
    if (!isHmrNoise(msg)) {
      window.caughtWarns.push(msg)
    }
    origError(...args)
  }
}

export default function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}
