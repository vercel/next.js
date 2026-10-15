/* eslint-disable import/no-extraneous-dependencies -- Build input only; the generated standalone bundle ships. */
// The pinned Vitest patch accepts explicit builtins instead of importing a runner.
// Supply that bridge only while the standalone package captures its context.
export function createTimerContext(global, bridge) {
  const previous = Object.getOwnPropertyDescriptor(
    global,
    '__vitest_required__'
  )
  Object.defineProperty(global, '__vitest_required__', {
    value: bridge,
    configurable: true,
  })
  try {
    return require('@sinonjs/fake-timers').withGlobal(global)
  } finally {
    if (previous) Object.defineProperty(global, '__vitest_required__', previous)
    else Reflect.deleteProperty(global, '__vitest_required__')
  }
}
