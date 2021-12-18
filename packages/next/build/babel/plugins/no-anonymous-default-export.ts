import { PluginObj, types as BabelTypes } from 'next/dist/compiled/babel/core'
import chalk from 'chalk'
const blockStatementBodyTypeReturnsJSX = (node: BabelTypes.BlockStatement) => {
  const returnStatment = node.body.find((statement) =>
    statement.type.match('ReturnStatement')
  ) as BabelTypes.ReturnStatement
  return returnStatment?.argument?.type === 'JSXElement'
}
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
        if (def.type === 'ArrowFunctionExpression') {
          // Check that arrow function body type returns JSX element implicity or block statement body returns JSX
          if (
            def.body.type === 'BlockStatement' &&
            !blockStatementBodyTypeReturnsJSX(def.body)
          ) {
            return
          }
          // Already checked block statement so this should be the last bad option
          if (def.body.type !== 'JSXElement') {
            return
          }
        }
        // Return statement must be explicit so just check if block statement returns JSX
        if (
          def.type === 'FunctionDeclaration' &&
          def.body?.type === 'BlockStatement' &&
          !blockStatementBodyTypeReturnsJSX(def.body)
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
                chalk.cyan(this.file.opts.filename),
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
                  chalk.cyan(this.file.opts.filename),
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
