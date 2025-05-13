let errorOnce = (_: string) => {}
if (process.env.NODE_ENV !== 'production') {
  const errors = new Set<string>()
  errorOnce = (msg: string) => {
    if (!errors.has(msg)) {
      console.error(msg)
    }
    errors.add(msg)
  }
}

export { errorOnce }
