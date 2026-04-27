import { installBackendHook } from './backend'

if (
  process.env.__NEXT_REACT_DEVTOOLS &&
  process.env.NODE_ENV !== 'production' &&
  typeof window !== 'undefined'
) {
  installBackendHook()
}
