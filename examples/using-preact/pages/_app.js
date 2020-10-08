const MyApp = ({ Component, pageProps, router }) => {
  // Custom logic here

  return <Component {...{ ...pageProps }} />
}

/**
 * Custom implementation, see: https://github.com/facebook/react/issues/16604#issuecomment-528663101
 */

const MyReactRefresh = (props) => {
  if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
    const runtime = require('react-refresh/runtime')
    runtime.injectIntoGlobalHook(window)
    window.$RefreshReg$ = () => {}
    window.$RefreshSig$ = () => (type) => type

    // BEFORE EVERY MODULE EXECUTES

    var prevRefreshReg = window.$RefreshReg$
    var prevRefreshSig = window.$RefreshSig$
    var RefreshRuntime = require('react-refresh/runtime')

    window.$RefreshReg$ = (type, id) => {
      // Note module.id is webpack-specific, this may vary in other bundlers
      const fullId = module.id + ' ' + id
      RefreshRuntime.register(type, fullId)
    }
    window.$RefreshSig$ = RefreshRuntime.createSignatureFunctionForTransform

    try {
      return MyApp(props)
    } finally {
      window.$RefreshReg$ = prevRefreshReg
      window.$RefreshSig$ = prevRefreshSig
    }
  }
  // For production, hosted on Vercel
  else return MyApp(props)
}

export default MyReactRefresh
