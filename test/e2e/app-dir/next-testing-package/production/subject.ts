export function describeProfile() {
  return process.env.NODE_ENV === 'production' ? 'optimized' : 'development'
}
