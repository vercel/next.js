import { touchBuiltinModulesForInstrumentation } from '../../packages/next/src/server/lib/router-utils/instrumentation-globals.external'

describe('touchBuiltinModulesForInstrumentation', () => {
  it('calls process.getBuiltinModule for core modules when available', () => {
    const called: string[] = []
    const originalGetBuiltinModule = (process as any).getBuiltinModule

    try {
      ;(process as any).getBuiltinModule = (modName: string) => {
        called.push(modName)
        return {}
      }

      touchBuiltinModulesForInstrumentation()

      expect(called).toEqual(['http', 'https', 'net', 'dns'])
    } finally {
      ;(process as any).getBuiltinModule = originalGetBuiltinModule
    }
  })

  it('handles environment where process.getBuiltinModule is undefined gracefully', () => {
    const originalGetBuiltinModule = (process as any).getBuiltinModule

    try {
      delete (process as any).getBuiltinModule

      expect(() => {
        touchBuiltinModulesForInstrumentation()
      }).not.toThrow()
    } finally {
      ;(process as any).getBuiltinModule = originalGetBuiltinModule
    }
  })
})
