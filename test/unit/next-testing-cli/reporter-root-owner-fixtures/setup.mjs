const shared = globalThis[Symbol.for('next.testing.root.reporter.owner')]
const typed = (value) => ({
  type: typeof value,
  ...(value === undefined ? {} : { value }),
})
export default function setup() {
  shared.trace('setup')
  return () => shared.trace('teardown', { exitCode: typed(process.exitCode) })
}
