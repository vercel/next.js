export function preloadComponent(Component: any, props: any) {
  const prev = console.error
  // Hide invalid hook call warning when calling component
  console.error = function (msg) {
    if (msg.startsWith('Warning: Invalid hook call.')) {
      // ignore
    } else {
      // @ts-expect-error argument is defined
      prev.apply(console, arguments)
    }
  }
  try {
    let result = Component(props)
    if (result && typeof result.then === 'function') {
      // Catch promise rejections to prevent unhandledRejection errors
      result.then(
        () => {},
        () => {}
      )
    }
    return function () {
      // We know what this component will render already.
      return result
    }
  } catch (x) {
    // something suspended or errored, try again later
  } finally {
    console.error = prev
  }
  return Component
}
