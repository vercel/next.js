const mockTrace = () => ({
  traceAsyncFn: (fn) => fn(mockTrace()),
  traceChild: () => mockTrace(),
})

module.exports = { mockTrace }
