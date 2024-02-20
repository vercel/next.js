import { join } from 'path'
import { webpack } from 'next/dist/compiled/webpack/webpack'

export async function transpileConfig({
  configPath,
  configFileName,
  cwd,
}: {
  configPath: string
  configFileName: string
  cwd: string
}): Promise<string> {
  const isCJS = configFileName.endsWith('.cts')
  const filename = `next.compiled.config.${isCJS ? 'cjs' : 'mjs'}`

  const webpackConfig: webpack.Configuration = {
    entry: configPath,
    output: {
      filename,
      path: cwd,
    },
    resolve: {
      extensions: ['.ts', '.tsx'],
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          loader: require.resolve('./babel/loader/index'),
        },
      ],
    },
  }

  async function runWebpack() {
    return new Promise<void>((resolve, reject) => {
      const compiler = webpack(webpackConfig)
      compiler.run((err) => {
        err ? reject(err) : resolve()
      })
    })
  }

  await runWebpack()

  return join(cwd, filename)
}
