export default {
  cacheComponents: true,
  partialPrefetching: true,
  distDir: process.env.NODE_ENV === 'production' ? '.next-production' : '.next',
}
