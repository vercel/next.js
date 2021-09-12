import { PluginObj, types as BabelTypes } from 'next/dist/compiled/babel/core'
import chalk from 'chalk'

export default function NoAnonymousDefaultExport({
  types: t,
  ...babel
}: {
  types: typeof BabelTypes
  caller: (callerCallback: (caller: any) => any) => any
}): PluginObj<any> {
  let onWarning: ((reason: string | Error) => void) | null = null
  babel.caller((caller) => {
    onWarning = caller.onWarning
    return '' // Intentionally empty to not invalidate cache
  })

  if (typeof onWarning !== 'function') {
    return { visitor: {} }
  }

  const warn: any = onWarning
  return {
    visitor: {
      ExportDefaultDeclaration(path) {
        const def = path.node.declaration

        if (
          !(
            def.type === 'ArrowFunctionExpression' ||
            def.type === 'FunctionDeclaration'
          )
        ) {
          return
        }

        switch (def.type) {
          case 'ArrowFunctionExpression': {
            warn(
              [
                chalk.yellow.bold(
                  'Anonymous arrow functions cause Fast Refresh to not preserve local component state.'
                ),
                'Please add a name to your function, for example:',
                '',
                chalk.bold('Before'),
                chalk.cyan('export default () => <div />;'),
                '',
                chalk.bold('After'),
                chalk.cyan('const Named = () => <div />;'),
                chalk.cyan('export default Named;'),
                '',
                `A codemod is available to fix the most common cases: ${chalk.cyan(
                  'https://nextjs.link/codemod-ndc'
                )}`,
              ].join('\n')
            )
            break
          }
          case 'FunctionDeclaration': {
            const isAnonymous = !Boolean(def.id)
            if (isAnonymous) {
              warn(
                [
                  chalk.yellow.bold(
                    'Anonymous function declarations cause Fast Refresh to not preserve local component state.'
                  ),
                  'Please add a name to your function, for example:',
                  '',
                  chalk.bold('Before'),
                  chalk.cyan('export default function () { /* ... */ }'),
                  '',
                  chalk.bold('After'),
                  chalk.cyan('export default function Named() { /* ... */ }'),
                  '',
                  `A codemod is available to fix the most common cases: ${chalk.cyan(
                    'https://nextjs.link/codemod-ndc'
                  )}`,
                ].join('\n')
              )
            }
            break
          }
          default: {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const _: never = def
          }
        }
      },
    },
  }
}
