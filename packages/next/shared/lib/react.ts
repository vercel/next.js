// @ts-ignore
import ReactDOMServerBrowser from 'react-dom/server.browser'

// Detect if react-dom is enabled streaming rendering mode
export const shouldUseReactRoot = !!ReactDOMServerBrowser.renderToReadableStream
