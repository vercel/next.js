import {
  getPath,
  createCompilationFacade,
  type LoaderPathData,
} from '../../turbopack/crates/turbopack-node/js/src/transforms/webpack-loaders-utils'

const { webpack } = require('next/dist/compiled/webpack/webpack')
const compiler = webpack({ context: process.cwd(), mode: 'none', entry: {} })
const compilation = compiler.newCompilation(compiler.newCompilationParams())

afterAll(
  () =>
    new Promise<void>((resolve, reject) => {
      compiler.close((error: Error | undefined) =>
        error ? reject(error) : resolve()
      )
    })
)

describe('webpack loader string path templates', () => {
  const data: LoaderPathData = {
    filename: 'styles/panel.module.css?theme=dark#button',
    hash: '0123456789abcdef',
    contentHash: 'f00dbabe',
    contentHashType: 'css',
    chunk: {
      id: 0,
      name: 'component',
      hash: 'abcdef',
      contentHash: { css: '987654321' },
    },
  }

  it.each([
    'literal.css',
    '[file]|[path]|[base]|[ext]|[query]|[fragment]',
    '[path][name]-[id].[contenthash:4][ext][query][fragment]',
    '[name]-[chunkhash:3]-[hash:5]-[fullhash:6]-[contenthash:4]',
    '[contenthash:0]-[contenthash:base64]-[name:2]',
    '[contenthash:2:3]-[unknown]-[local]-[folder]',
    '[NAME]-[ContentHash]',
    '[\\name\\]-[\\\\contenthash\\\\]',
  ])('matches webpack for %s', (template) => {
    expect(getPath(template, structuredClone(data))).toBe(
      compilation.getPath(template, structuredClone(data))
    )
  })

  it.each([
    { filename: 'styles/what\0?name.css?theme=dark#button' },
    { filename: 'styles/panel.module.css' },
    { filename: 'plain' },
    { filename: '' },
    { ...data, contentHash: undefined },
    { ...data, chunk: { id: 0, name: '' } },
  ])('matches webpack filename and supplied hash context: %j', (context) => {
    const template = '[file]|[path]|[base]|[name]|[ext]|[query]|[fragment]'
    expect(getPath(template, context)).toBe(
      compilation.getPath(template, structuredClone(context))
    )
  })

  it('uses a supplied chunk content hash when the top-level hash is absent', () => {
    const context = { ...data, contentHash: undefined }
    expect(getPath('[contenthash:4]', context)).toBe(
      compilation.getPath('[contenthash:4]', structuredClone(context))
    )
  })

  it('rejects a missing value in a supported context instead of inventing it', () => {
    const context = { chunk: {} }
    expect(() => getPath('[id]', context)).toThrow(
      'Path variable [id] not implemented in this context'
    )
    expect(() => compilation.getPath('[id]', context)).toThrow(
      'Path variable [id] not implemented in this context'
    )
  })
})

describe('loader compilation compatibility boundary', () => {
  const facade = createCompilationFacade({
    hashFunction: 'xxhash64',
    hashDigest: 'hex',
    hashDigestLength: 16,
  })

  it('exposes only the supported members, including an unset hash salt', () => {
    expect(Object.keys(facade)).toEqual(['outputOptions', 'getPath'])
    expect(facade.outputOptions.hashFunction).toBe('xxhash64')
    expect(facade.outputOptions.hashSalt).toBeUndefined()
    expect(
      facade.getPath('[name][ext]', { filename: 'styles/panel.css' })
    ).toBe('panel.css')
  })

  it('preserves the css-loader optional-options feature probe', () => {
    expect(Reflect.get(facade, 'options')).toBeUndefined()
    expect('options' in facade).toBe(false)
  })

  it.each(['hooks', 'compiler', 'modules', 'assets', 'getLogger', 'emitAsset'])(
    'throws explicitly when a loader reads %s',
    (property) => {
      expect(() => Reflect.get(facade, property)).toThrow(
        `Turbopack does not support _compilation.${property} in webpack loaders`
      )
    }
  )

  it.each(['path', 'publicPath', 'assetModuleFilename'])(
    'does not silently expose an unsupported output option: %s',
    (property) => {
      expect(() => Reflect.get(facade.outputOptions, property)).toThrow(
        `Turbopack does not support _compilation.outputOptions.${property} in webpack loaders`
      )
    }
  )

  it('does not allow callers to extend or mutate the compatibility surface', () => {
    expect(() => Reflect.set(facade, 'hooks', {})).toThrow(
      '_compilation.hooks is read-only in Turbopack'
    )
    expect(() =>
      Reflect.set(facade.outputOptions, 'hashSalt', 'changed')
    ).toThrow('_compilation.outputOptions.hashSalt is read-only in Turbopack')
    expect(() =>
      Object.defineProperty(facade, 'assets', { value: {} })
    ).toThrow()
  })
})
