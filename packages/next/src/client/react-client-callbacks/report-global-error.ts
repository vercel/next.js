export const reportGlobalError =
  typeof reportError === 'function'
    ? // In modern browsers, reportError will dispatch an error event,
      // emulating an uncaught JavaScript error.
      reportError
    : (error: unknown) => {
        // TODO: Dispatch error event
        globalThis.console.error(error)
      }
