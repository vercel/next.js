import { touchBuiltinModulesForInstrumentation } from '../../packages/next/src/server/lib/router-utils/instrumentation-globals.external'

describe('touchBuiltinModulesForInstrumentation', () => {
  it('calls require for core modules', () => {
    const called: string[] = []
    const originalRequire = (touchBuiltinModulesForInstrumentation as any)
      .require

    try {
      ;(touchBuiltinModulesForInstrumentation as any).require = (
        modName: string
      ) => {
        called.push(modName)
        return {}
      }

      touchBuiltinModulesForInstrumentation()

      expect(called).toEqual(['http', 'https', 'net', 'dns'])
    } finally {
      ;(touchBuiltinModulesForInstrumentation as any).require = originalRequire
    }
  })
})
