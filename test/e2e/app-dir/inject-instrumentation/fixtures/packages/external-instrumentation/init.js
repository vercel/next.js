exports.register = function () {
  const packages = (globalThis.__instrumentationPackages ??= [])
  packages.push({
    name: 'external-instrumentation',
    external: /\/node_modules\/external-instrumentation\/init\.js$/.test(
      __filename.replace(/\\/g, '/')
    ),
  })
}
