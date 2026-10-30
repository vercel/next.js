exports.register = function () {
  const packages = (globalThis.__instrumentationPackages ??= [])
  packages.push({ name: 'bundled-instrumentation' })
}
