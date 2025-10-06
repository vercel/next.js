if (globalThis.performance === undefined) {
  globalThis.performance = { timeOrigin: 0, now: () => Date.now() } as any
}
