/* global jest */
jest.autoMockOff()
const defineTest = require('jscodeshift/dist/testUtils').defineTest

const fixtureDir = 'next-experimental-turbo-to-turbopack'

defineTest(__dirname, fixtureDir, null, `${fixtureDir}/commonjs-var`, { parser: 'js' })
defineTest(__dirname, fixtureDir, null, `${fixtureDir}/esm`, { parser: 'js' })
defineTest(__dirname, fixtureDir, null, `${fixtureDir}/mixed-config`, { parser: 'js' })
defineTest(__dirname, fixtureDir, null, `${fixtureDir}/modified-var`, { parser: 'js' })
defineTest(__dirname, fixtureDir, null, `${fixtureDir}/wrapped-function`, { parser: 'js' })
defineTest(__dirname, fixtureDir, null, `${fixtureDir}/no-change`, { parser: 'js' })
defineTest(__dirname, fixtureDir, null, `${fixtureDir}/property-assignment`, { parser: 'js' })
defineTest(__dirname, fixtureDir, null, `${fixtureDir}/typescript-as-const`, { parser: 'ts' })
defineTest(__dirname, fixtureDir, null, `${fixtureDir}/typescript`, { parser: 'ts' })
defineTest(__dirname, fixtureDir, null, `${fixtureDir}/typescript-satisfies`, { parser: 'ts' })
defineTest(__dirname, fixtureDir, null, `${fixtureDir}/typescript-satisfies-wrapped`, { parser: 'ts' })
