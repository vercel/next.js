module.exports = {
  reactStrictMode: true,
  transpilePackages: ['css', 'font', 'transpile-ts-lib', 'transpile-cjs-lib'],
  serverExternalPackages: [
    'conditional-exports-optout',
    'dual-pkg-optout',
    'transitive-external',
    'esm',
  ],
}
