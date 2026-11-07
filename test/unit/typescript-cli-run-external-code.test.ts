import { supportsRunExternalCode } from 'next/dist/lib/typescript/runTypeCheckCli'

describe('supportsRunExternalCode', () => {
  it.each([
    ['5.9.3', false],
    ['6.0.3', false],
    ['7.0.2', false],
    ['7.1.0-dev.20260918.1', true],
    ['7.1.0-beta', true],
    ['7.1.0', true],
    ['7.2.0', true],
    ['8.0.0', true],
  ])('TypeScript %s: %s', (version, expected) => {
    expect(supportsRunExternalCode(version)).toBe(expected)
  })
})
