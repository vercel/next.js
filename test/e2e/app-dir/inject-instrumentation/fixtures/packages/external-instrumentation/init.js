exports.register = function () {
  const packages = (globalThis.__instrumentationPackages ??= [])
  packages.push({
    name: 'external-instrumentation',
    marker: 'external-instrumentation:register-implementation',
  })
}
