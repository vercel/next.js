/** @type {import('next').NextConfig} */
module.exports = {
  // `export const runtime = 'edge'` is not compatible with Cache Components.
  cacheComponents: false,
}
