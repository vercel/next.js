/* global jest */
jest.autoMockOff()

const { getNpxCommand } = require('../handle-package')

describe('getNpxCommand', () => {
  // `yarn` is left out on purpose: it probes for `yarn dlx` with a subprocess,
  // so its result depends on whether Yarn is installed on the machine.
  it.each([
    ['npm', 'npx --yes'],
    ['pnpm', 'pnpm --silent dlx'],
    ['bun', 'bunx'],
  ])('uses %s to run a package without installing it', (pkgManager, expected) => {
    expect(getNpxCommand(pkgManager, process.cwd())).toBe(expected)
  })
})
