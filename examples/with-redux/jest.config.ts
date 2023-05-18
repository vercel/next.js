/* Core */
import React from 'react'
import type { Config } from 'jest'

const jestConfig: Config = {
  silent: false,
  verbose: true,
  globals: { React },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: { '@/(.*)': '<rootDir>/src/$1' },
  transform: {
    '^.+\\.(t|j)sx?$': '@swc/jest',
    '.+\\.(css|styl|less|sass|scss)$': 'jest-css-modules-transform',
  },
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname',
  ],
}

export default jestConfig
