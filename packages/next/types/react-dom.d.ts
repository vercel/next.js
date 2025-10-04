export {}

declare module 'react-dom/server' {
  /**
   * Options for `renderToReadableStream`.
   *
   * https://github.com/facebook/react/blob/aec521a96d3f1bebc2ba38553d14f4989c6e88e0/packages/react-dom/src/server/ReactDOMFizzServerEdge.js#L36-L52
   */
  export interface RenderToReadableStreamOptions {
    onPostpone?: (reason: string) => void
    unstable_externalRuntimeSrc?:
      | string
      | import('react-dom/server').BootstrapScriptDescriptor
  }
}

declare module 'react-dom/static' {
  /**
   * Options for `prerender`.
   *
   * https://github.com/facebook/react/blob/aec521a96d3f1bebc2ba38553d14f4989c6e88e0/packages/react-dom/src/server/ReactDOMFizzStaticEdge.js#L35-L49
   */
  export interface PrerenderOptions {
    onPostpone?: (reason: string) => void
    unstable_externalRuntimeSrc?:
      | string
      | import('react-dom/server').BootstrapScriptDescriptor
  }
}
