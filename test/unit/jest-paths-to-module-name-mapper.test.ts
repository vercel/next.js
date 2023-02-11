/* eslint-env jest */
import { pathsToModuleNameMapper } from 'next/dist/build/jest/paths-to-module-name-mapper'

// Tests copied from ts-jest: https://github.com/kulshekhar/ts-jest/blob/5a0880add0da8d71900eee20c7642e6be65f6a66/src/config/paths-to-module-name-mapper.spec.ts

const tsconfigMap = {
  log: ['src/utils/log'],
  server: ['src/server'],
  client: ['src/client', 'src/client/index'],
  'util/*': ['src/utils/*'],
  'api/*': ['src/api/*'],
  'test/*': ['test/*'],
  'mocks/*': ['test/mocks/*'],
  'test/*/mock': ['test/mocks/*', 'test/__mocks__/*'],
  '@foo-bar/common': ['../common/dist/library'],
  '@pkg/*': ['./packages/*'],
}

describe('pathsToModuleNameMapper', () => {
  test('should convert tsconfig mapping', () => {
    expect(pathsToModuleNameMapper(tsconfigMap, { prefix: '<rootDir>/' }))
      .toMatchInlineSnapshot(`
      Object {
        "^@foo\\\\-bar/common$": "<rootDir>/../common/dist/library",
        "^@pkg/(.*)$": "<rootDir>/packages/$1",
        "^api/(.*)$": "<rootDir>/src/api/$1",
        "^client$": Array [
          "<rootDir>/src/client",
          "<rootDir>/src/client/index",
        ],
        "^log$": "<rootDir>/src/utils/log",
        "^mocks/(.*)$": "<rootDir>/test/mocks/$1",
        "^server$": "<rootDir>/src/server",
        "^test/(.*)$": "<rootDir>/test/$1",
        "^test/(.*)/mock$": Array [
          "<rootDir>/test/mocks/$1",
          "<rootDir>/test/__mocks__/$1",
        ],
        "^util/(.*)$": "<rootDir>/src/utils/$1",
      }
    `)
  })

  test('should add `js` extension to resolved config with useESM: true', () => {
    expect(
      pathsToModuleNameMapper(tsconfigMap, {
        prefix: '<rootDir>/',
        useESM: true,
      })
    ).toEqual({
      /**
       * Why not using snapshot here?
       * Because the snapshot does not keep the property order, which is important for jest.
       * A pattern ending with `\\.js` should appear before another pattern without the extension does.
       */
      '^log$': '<rootDir>/src/utils/log',
      '^server$': '<rootDir>/src/server',
      '^client$': ['<rootDir>/src/client', '<rootDir>/src/client/index'],
      '^util/(.*)\\.js$': '<rootDir>/src/utils/$1',
      '^util/(.*)$': '<rootDir>/src/utils/$1',
      '^api/(.*)\\.js$': '<rootDir>/src/api/$1',
      '^api/(.*)$': '<rootDir>/src/api/$1',
      '^test/(.*)\\.js$': '<rootDir>/test/$1',
      '^test/(.*)$': '<rootDir>/test/$1',
      '^mocks/(.*)\\.js$': '<rootDir>/test/mocks/$1',
      '^mocks/(.*)$': '<rootDir>/test/mocks/$1',
      '^test/(.*)/mock\\.js$': [
        '<rootDir>/test/mocks/$1',
        '<rootDir>/test/__mocks__/$1',
      ],
      '^test/(.*)/mock$': [
        '<rootDir>/test/mocks/$1',
        '<rootDir>/test/__mocks__/$1',
      ],
      '^@foo\\-bar/common$': '<rootDir>/../common/dist/library',
      '^@pkg/(.*)\\.js$': '<rootDir>/packages/$1',
      '^@pkg/(.*)$': '<rootDir>/packages/$1',
      '^(\\.{1,2}/.*)\\.js$': '$1',
    })
  })
})
