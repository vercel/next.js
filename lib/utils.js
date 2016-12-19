export function warn (message) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(message)
  }
}
