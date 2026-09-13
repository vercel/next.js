const { preserveBundler, filterCodemods, validateUpgradeOptions, validateReactVersion } = require('../upgrade-options')

it('rejects unknown transforms and non-exact React choices before migration', () => {
  expect(() => validateUpgradeOptions({ skipCodemod: ['not-a-transform'] })).toThrow('Unknown codemod')
  expect(() => validateUpgradeOptions({ reactVersion: '^19' })).toThrow('exact')
})
it('filters excluded adoption transforms before the runner selects defaults', () => {
  const choices = [{ value: 'next-async-request-api' }, { value: 'cache-components-instant-false' }]
  expect(filterCodemods(choices, ['cache-components-instant-false'])).toEqual([choices[0]])
  expect(filterCodemods(choices)).toEqual(choices)
})
it('preserves a published React 18 pair for Pages but rejects it for App Router', () => {
  const peers = { react: '^18.3.1 || ^19.0.0', 'react-dom': '^18.3.1 || ^19.0.0' }
  const react = { version: '18.3.1' }
  const dom = { version: '18.3.1', peerDependencies: { react: '^18.3.1' } }
  expect(() => validateReactVersion('18.3.1', '15.5.24', peers, false, react, dom)).not.toThrow()
  expect(() => validateReactVersion('18.3.1', '15.5.24', peers, true, react, dom)).toThrow('compatible pair')
  expect(() => validateReactVersion('18.3.1', '15.5.24', peers, false, react, { ...dom, version: '19.0.0' })).toThrow('compatible pair')
})


it('leaves compound and wrapper scripts for review and preserves explicit bundlers', () => {
  const scripts = {
    dev: 'cross-env PORT=4000 next dev',
    build: 'next build && node upload.js',
    turbo: 'next dev --turbo',
    webpack: 'next build --webpack',
    check: 'tsc --noEmit',
  }
  const before = { ...scripts }
  expect(preserveBundler(scripts, '15.5.24', '16.3.3')).toEqual(['dev', 'build'])
  expect(scripts).toEqual(before)
})
it('leaves bundlers alone when the upgrade does not cross the changed default', () => {
  for (const [source, target] of [['15.5.23', '15.5.24'], ['16.3.2', '16.3.3']]) {
    const scripts = { dev: 'next dev', build: 'next build' }
    expect(preserveBundler(scripts, source, target)).toEqual([])
    expect(scripts).toEqual({ dev: 'next dev', build: 'next build' })
  }
})
