/* eslint-env jest */
import os from 'os'
import path from 'path'
import postcss from 'postcss'
import { Span } from 'next/dist/trace'
import loader from 'next/dist/build/webpack/loaders/postcss-loader/src'

const existingDir = path.resolve(os.tmpdir())
const missingDir = path.join(
  existingDir,
  `next-postcss-loader-missing-${process.pid}-${Date.now()}`
)

function runLoader(messages: Array<Record<string, unknown>>) {
  const loaderContext = {
    resourcePath: path.join(existingDir, 'styles.css'),
    context: existingDir,
    sourceMap: false,
    emitWarning: jest.fn(),
    emitFile: jest.fn(),
    addDependency: jest.fn(),
    addBuildDependency: jest.fn(),
    addMissingDependency: jest.fn(),
    addContextDependency: jest.fn(),
    currentTraceSpan: new Span({ name: 'test' }),
    getOptions: () => ({
      postcss: async () => ({
        postcssWithPlugins: postcss([
          {
            postcssPlugin: 'test-messages',
            Once(_root, { result }) {
              result.messages.push(...(messages as any[]))
            },
          },
        ]),
      }),
    }),
    async: undefined as unknown as () => (err: Error | null) => void,
  }

  return new Promise<typeof loaderContext>((resolve, reject) => {
    loaderContext.async = () => (err) =>
      err ? reject(err) : resolve(loaderContext)
    loader.call(loaderContext, 'a { color: red }', null, null)
  })
}

describe('postcss-loader', () => {
  it.each([
    ['dir-dependency', 'dir'],
    ['context-dependency', 'file'],
  ])(
    'registers an existing directory from a %s message as a context dependency',
    async (type, key) => {
      const ctx = await runLoader([{ type, [key]: existingDir }])

      expect(ctx.addContextDependency).toHaveBeenCalledWith(existingDir)
      expect(ctx.addMissingDependency).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['dir-dependency', 'dir'],
    ['context-dependency', 'file'],
  ])(
    'registers a non-existent directory from a %s message as a missing dependency',
    async (type, key) => {
      const ctx = await runLoader([{ type, [key]: missingDir }])

      expect(ctx.addMissingDependency).toHaveBeenCalledWith(missingDir)
      expect(ctx.addContextDependency).not.toHaveBeenCalled()
    }
  )
})
