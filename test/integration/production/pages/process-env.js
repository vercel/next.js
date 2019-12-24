if (process.browser) {
  global.__THIS_SHOULD_ONLY_BE_DEFINED_IN_BROWSER_CONTEXT__ = true
}

if (!process.browser) {
  global.__THIS_SHOULD_ONLY_BE_DEFINED_IN_SERVER_CONTEXT__ = true
}

const ProcessEnv = () => <div id="node-env">{process.env.NODE_ENV}</div>

ProcessEnv.getInitialProps = () => ({})

export default ProcessEnv
