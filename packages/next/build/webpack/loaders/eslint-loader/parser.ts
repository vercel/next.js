import {
  parseSync as parse,
  // @ts-ignore
  tokTypes as tt,
  traverse,
  loadPartialConfig,
} from '@babel/core'

const babylonToEspree = require('babel-eslint/lib/babylon-to-espree')

export default function (
  code: string,
  options: any = {
    ecmaVersion: 2018,
    sourceType: 'unambiguous',
    allowImportExportEverywhere: false,
    babelOptions: {},
    requireConfigFile: false,
  }
) {
  let opts: any = {
    sourceType: options.sourceType,
    filename: options.filePath,
    cwd: options.babelOptions.cwd,
    root: options.babelOptions.root,
    rootMode: options.babelOptions.rootMode,
    envName: options.babelOptions.envName,
    configFile: options.babelOptions.configFile,
    babelrc: options.babelOptions.babelrc,
    babelrcRoots: options.babelOptions.babelrcRoots,
    extends: options.babelOptions.extends,
    env: options.babelOptions.env,
    overrides: options.babelOptions.overrides,
    test: options.babelOptions.test,
    include: options.babelOptions.include,
    exclude: options.babelOptions.exclude,
    ignore: options.babelOptions.ignore,
    only: options.babelOptions.only,
    parserOpts: {
      ranges: true,
      tokens: true,
      plugins: [
        'estree',
        'jsx',
        'dynamicImport',
        'classProperties',
        'classPrivateProperties',
        'objectRestSpread',
        'jsx',
        'bigInt',
        'numericSeparator',
        'exportNamespaceFrom',
        'jsx',
        'numericSeparator',
        'logicalAssignment',
        'nullishCoalescingOperator',
        'optionalChaining',
        'jsonStrings',
        'optionalCatchBinding',
        'asyncGenerators',
        'objectRestSpread',
        'exportNamespaceFrom',
        'dynamicImport',
        'topLevelAwait',
      ],
    },
    caller: {
      name: 'babel-eslint',
    },
  }

  if (options.requireConfigFile !== false) {
    /// @ts-ignore
    const config = loadPartialConfig(opts)

    if (config !== null) {
      /// @ts-ignore
      if (!config.hasFilesystemConfig()) {
        throw new Error(
          `No Babel config file detected for ${config.options.filename}. Either disable config file checking with requireConfigFile: false, or configure Babel so that it can find the config files.`
        )
      }

      opts = config.options
    }
  }

  let ast

  try {
    ast = parse(code, opts)
  } catch (err) {
    if (err instanceof SyntaxError) {
      /// @ts-ignore
      err.lineNumber = err.loc.line
      /// @ts-ignore
      err.column = err.loc.column
    }

    throw err
  }
  // @ts-ignore
  const espreeTree = JSON.parse(JSON.stringify(ast))
  babylonToEspree(espreeTree, traverse, tt, code)
  return {
    babelAST: ast,
    espreeTree: espreeTree,
  }
}
