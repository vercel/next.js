import loaderUtils from 'loader-utils'
import validateOptions from 'schema-utils'

import schema from './options'

export default function getOptions(loaderContext) {
  const options = {
    eslintPath: 'eslint',
    ...loaderUtils.getOptions(loaderContext),
  }

  validateOptions(schema, options, {
    name: 'ESLint Loader',
    baseDataPath: 'options',
  })

  const { CLIEngine } = require(options.eslintPath)

  options.formatter = CLIEngine.getFormatter('stylish')

  if (options.outputReport && options.outputReport.formatter) {
    options.outputReport.formatter = CLIEngine.getFormatter('stylish')
  }

  return options
}
