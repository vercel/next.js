import { applyMiddleware, compose } from 'redux'
import { IS_BROWSER } from './exenv'

export default function createMiddleware (clientMiddleware) {
  const middleware = applyMiddleware(clientMiddleware)
  if (IS_BROWSER && window.devToolsExtension) {
    return compose(middleware, window.devToolsExtension())
  }
  return middleware
}
