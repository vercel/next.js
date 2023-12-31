declare global {
  interface Window {
    _nextSetupHydrationWarning?: boolean
  }
}

if (!window._nextSetupHydrationWarning) {
  const origConsoleError = window.console.error
  window.console.error = (...args) => {
    const isHydrateError = args.some(
      (arg) =>
        typeof arg === 'string' &&
        arg.match(/(hydration|content does not match|did not match)/i)
    )
    if (isHydrateError) {
      args = [
        ...args,
        `\n\nSee more info here: https://nextjs.org/docs/messages/react-hydration-error`,
      ]
    }
    origConsoleError.apply(window.console, args)
  }
  window._nextSetupHydrationWarning = true
}

export {}
