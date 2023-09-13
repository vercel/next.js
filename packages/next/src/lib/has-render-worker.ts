export function hasRenderWorker() {
  return Boolean(
    typeof jest === 'undefined' &&
      !process.env.NEXT_PRIVATE_WORKER &&
      (process.env.__NEXT_PRIVATE_PREBUNDLED_REACT ||
        process.env.NODE_ENV === 'development')
  )
}
