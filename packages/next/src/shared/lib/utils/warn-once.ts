let warnOnce = (_: string) => {}
if (process.env.NODE_ENV !== 'production') {
  const warnings = new Set<string>()
  warnOnce = (msg: string) => {
    if (!warnings.has(msg)) {
      console.warn(msg)
    }
    warnings.add(msg)
  }
}

export { warnOnce }
