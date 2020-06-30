import { PluginObj } from '@babel/core'
import chalk from 'next/dist/compiled/chalk'

export default function (): PluginObj<any> {
  return {
    visitor: {
      ImportDeclaration(path, state) {
        const source = path.node.source.value
        if (source !== 'next/head') return

        if (state.opts.key.indexOf('_document') !== -1) {
          throw new Error(
            `
              ${chalk.yellow.bold('Error: ')}
              ${chalk.cyan(
                'next/head'
              )} should not be imported inside ${chalk.cyan(`_document`)}.
              \nRead more: https://err.sh/next.js/document-import-next-head
            `
          )
        }
      },
    },
  }
}
