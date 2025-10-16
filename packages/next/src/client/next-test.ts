// For App and Pages Router
if (process.env.NODE_ENV !== 'production' && process.env.__NEXT_TEST_MODE) {
  // Our tests don't run with React DevTools attached so the CTA is noisy.
  // See https://github.com/facebook/react/pull/11448
  ;(window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = { isDisabled: true }
}
