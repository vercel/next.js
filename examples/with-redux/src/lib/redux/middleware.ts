/* Core */
import { Middleware } from '@reduxjs/toolkit'

const middleware: Middleware[] = []

if (process.env.NODE_ENV === 'development') {
  // eslint-disable-next-line
  const { createLogger } = require('redux-logger')

  const logger = createLogger({
    duration: true,
    timestamp: false,
    collapsed: true,
    colors: {
      title: () => '#139BFE',
      prevState: () => '#1C5FAF',
      action: () => '#149945',
      nextState: () => '#A47104',
      error: () => '#ff0005',
    },
    predicate: () => process.browser,
  })

  middleware.push(logger)
}

export { middleware }
