const { defaults: tsjPreset } = require('ts-jest/presets')

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    ...tsjPreset.transform,
    '\\.graphql$': [
      'graphql-let/jestTransformer',
      { subsequentTransformer: 'ts-jest' },
    ],
  },
  globals: {
    'ts-jest': {
      tsConfig: 'tsconfig.jest.json',
    },
  },
}
