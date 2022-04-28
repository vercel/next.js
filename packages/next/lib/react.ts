// Detect if react-dom is enabled streaming rendering mode
export const shouldUseReactRoot = !!require('react-dom/server.browser')
  .renderToReadableStream
