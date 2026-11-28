/** @type {import('next').NextConfig} */
module.exports = {
  // Bundle both packages so that webpack puts each one into its own
  // `vendor-chunks/*` chunk on the server in development.
  transpilePackages: ['dep-a', 'dep-b'],
}
