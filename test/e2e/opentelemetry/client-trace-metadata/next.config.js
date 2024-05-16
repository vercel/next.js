module.exports = {
  experimental: {
    instrumentationHook: true,
    clientTraceMetadata: [
      'my-parent-span-id',
      'my-test-key-1',
      'my-test-key-2',
    ],
  },
}
