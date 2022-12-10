export function isServerComponentError(error: Error): boolean {
  return !!error.stack?.includes('webpack-internal:///(sc_server)/')
}
