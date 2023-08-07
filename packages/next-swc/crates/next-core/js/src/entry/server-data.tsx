// IPC need to be the first import to allow it to catch errors happening during
// the other imports
import startHandler from '../internal/page-server-handler'

// eslint-disable-next-line
import Document from 'next/document'
import App from 'next/app'

startHandler({
  isDataReq: true,
  App,
  Document,
  mod: () => {
    return import('INNER').then((namespace) => ({
      Component: () => null,
      namespace,
    }))
  },
})
