import Document from 'next/document'
import { initialConfig } from 'test-external-image-config'

// loadComponents evaluates _document before _app and the page entry.
if (initialConfig.path !== '/custom-image') {
  throw new Error('External image options were not registered before _document')
}

export default Document
