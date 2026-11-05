import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { transpile, ScriptTarget } from 'typescript'

const runtime = transpile(
  readFileSync(
    join(
      __dirname,
      '../../turbopack/crates/turbopack-ecmascript-runtime/js/src/browser/runtime/base/dev-base.ts'
    ),
    'utf8'
  ),
  { target: ScriptTarget.ES2020 }
)

function createRefreshContext(intercepted = false, globals = {}) {
  return runInNewContext(
    `${runtime}\ncreateDevModuleContext({}, {}, ${intercepted}).k`,
    {
      Context: function Context() {},
      moduleCache: {},
      runtimeModules: undefined,
      createModuleWithDirectionFlag: false,
      ...globals,
    }
  )
}

describe('Turbopack refresh signatures without installed refresh hooks', () => {
  it('preserves function and class component identity', () => {
    const refresh = createRefreshContext()
    function Component(value: string) {
      return value
    }
    class ClassComponent {
      static displayName = 'ClassComponent'
    }

    for (const component of [Component, ClassComponent]) {
      const signature = refresh.signature()
      expect(signature(component, 'signature', false)).toBe(component)
      expect(signature(component)).toBe(component)
      expect(signature()).toBeUndefined()
    }
    expect(refresh.signature()(Component)('rendered')).toBe('rendered')
    expect(refresh.signature()(ClassComponent).displayName).toBe(
      'ClassComponent'
    )
  })

  it('uses the installed hooks when module execution was intercepted', () => {
    const register = jest.fn()
    const signature = jest.fn()
    const refresh = createRefreshContext(true, {
      $RefreshReg$: register,
      $RefreshSig$: signature,
    })
    expect(refresh.register).toBe(register)
    expect(refresh.signature).toBe(signature)
  })
})
