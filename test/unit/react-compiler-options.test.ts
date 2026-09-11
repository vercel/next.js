import { configSchema } from '../../packages/next/src/server/config-schema'

jest.mock('babel-plugin-react-compiler', () => ({}), { virtual: true })

describe('React Compiler options', () => {
  it.each([true, false])(
    'accepts enablePreserveExistingMemoizationGuarantees: %s',
    (enablePreserveExistingMemoizationGuarantees) => {
      expect(() =>
        configSchema.parse({
          reactCompiler: {
            environment: { enablePreserveExistingMemoizationGuarantees },
          },
        })
      ).not.toThrow()
    }
  )

  it.each([
    [
      false,
      {
        enableNameAnonymousFunctions: false,
        enablePreserveExistingMemoizationGuarantees: false,
      },
    ],
    [undefined, { enableNameAnonymousFunctions: false }],
  ])(
    'forwards the Babel environment option when configured as %s',
    async (enablePreserveExistingMemoizationGuarantees, environment) => {
      const { getBabelLoader } = await import(
        '../../packages/next/src/build/get-babel-loader-config'
      )
      const reactCompiler = {
        compilationMode: 'infer' as const,
        ...(enablePreserveExistingMemoizationGuarantees !== undefined
          ? {
              environment: { enablePreserveExistingMemoizationGuarantees },
            }
          : {}),
      }
      const loader = getBabelLoader(
        false,
        undefined,
        false,
        '.next',
        undefined,
        process.cwd(),
        'src',
        false,
        true,
        reactCompiler,
        undefined
      )
      const compilerOptions = loader!.options.reactCompilerPlugins![0][1]

      expect(compilerOptions).toEqual({
        compilationMode: 'infer',
        environment,
      })
    }
  )
})
