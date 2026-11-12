exports.generatedScenarios = [
  'basic-mjs',
  'basic-js',
  'value-undefined',
  'value-null',
  'value-false',
  'value-zero',
  'value-emptyObject',
  'value-emptyArray',
  'value-nan',
  'value-infinity',
  'value-string',
  'modern-unmodified',
  'modern-identity',
  'two-reporters',
  'nojson-function-default',
  'nojson-function-dot',
]
exports.failureScenarios = [
  'mutation-false',
  'mutation-true',
  'async-true',
  'thenable-true',
  'hook-reject',
  'generator-reject',
  'json-bigint',
]
exports.productionScenarios = [
  'production-mjs',
  'production-js',
  ...exports.failureScenarios,
  'nojson-function-default',
  'nojson-function-dot',
]
