if (typeof window !== 'undefined') {
  throw new Error('An Expected error occurred')
}

const ErrorInTheBrowserGlobalScope = () => <div />

export default ErrorInTheBrowserGlobalScope
