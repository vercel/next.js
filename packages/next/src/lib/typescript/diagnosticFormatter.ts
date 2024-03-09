import { bold, cyan, red, yellow } from '../picocolors'
import path from 'path'

// eslint typescript has a bug with TS enums
/* eslint-disable no-shadow */
export enum DiagnosticCategory {
  Warning = 0,
  Error = 1,
  Suggestion = 2,
  Message = 3,
}

function getFormattedLinkDiagnosticMessageText(
  diagnostic: import('typescript').Diagnostic
) {
  const message = diagnostic.messageText
  if (typeof message === 'string' && diagnostic.code === 2322) {
    const match =
      message.match(
        /Type '"(.+)"' is not assignable to type 'RouteImpl<.+> \| UrlObject'\./
      ) ||
      message.match(
        /Type '"(.+)"' is not assignable to type 'UrlObject \| RouteImpl<.+>'\./
      )

    if (match) {
      const [, href] = match
      return `"${bold(
        href
      )}" is not an existing route. If it is intentional, please type it explicitly with \`as Route\`.`
    } else if (
      message === "Type 'string' is not assignable to type 'UrlObject'."
    ) {
      const relatedMessage = diagnostic.relatedInformation?.[0]?.messageText
      if (
        typeof relatedMessage === 'string' &&
        relatedMessage.match(
          /The expected type comes from property 'href' which is declared here on type 'IntrinsicAttributes & /
        )
      ) {
        return `Invalid \`href\` property of \`Link\`: the route does not exist. If it is intentional, please type it explicitly with \`as Route\`.`
      }
    }
  } else if (typeof message === 'string' && diagnostic.code === 2820) {
    const match =
      message.match(
        /Type '"(.+)"' is not assignable to type 'RouteImpl<.+> \| UrlObject'\. Did you mean '"(.+)"'?/
      ) ||
      message.match(
        /Type '"(.+)"' is not assignable to type 'UrlObject \| RouteImpl<.+>'\. Did you mean '"(.+)"'?/
      )

    if (match) {
      const [, href, suggestion] = match
      return `"${bold(href)}" is not an existing route. Did you mean "${bold(
        suggestion
      )}" instead? If it is intentional, please type it explicitly with \`as Route\`.`
    }
  }
}

function getFormattedLayoutAndPageDiagnosticMessageText(
  relativeSourceFilepath: string,
  diagnostic: import('typescript').Diagnostic
) {
  const message =
    typeof diagnostic.messageText === 'string'
      ? diagnostic
      : diagnostic.messageText
  const messageText = message.messageText

  if (typeof messageText === 'string') {
    const type = /page\.[^.]+$/.test(relativeSourceFilepath)
      ? 'Page'
      : /route\.[^.]+$/.test(relativeSourceFilepath)
      ? 'Route'
      : 'Layout'

    // Reference of error codes:
    // https://github.com/Microsoft/TypeScript/blob/main/src/compiler/diagnosticMessages.json
    switch (message.code) {
      case 2344:
        const filepathAndType = messageText.match(/typeof import\("(.+)"\)/)
        if (filepathAndType) {
          let main = `${type} "${bold(
            relativeSourceFilepath
          )}" does not match the required types of a Next.js ${type}.`

          function processNext(
            indent: number,
            next?: import('typescript').DiagnosticMessageChain[]
          ) {
            if (!next) return

            for (const item of next) {
              switch (item.code) {
                case 2200:
                  const mismatchedField =
                    item.messageText.match(/The types of '(.+)'/)
                  if (mismatchedField) {
                    main += '\n' + ' '.repeat(indent * 2)
                    main += `"${bold(mismatchedField[1])}" has the wrong type:`
                  }
                  break
                case 2322:
                  const types = item.messageText.match(
                    /Type '(.+)' is not assignable to type '(.+)'./
                  )
                  if (types) {
                    main += '\n' + ' '.repeat(indent * 2)

                    if (
                      types[2] === 'PageComponent' ||
                      types[2] === 'LayoutComponent'
                    ) {
                      main += `The exported ${type} component isn't correctly typed.`
                    } else {
                      main += `Expected "${bold(
                        types[2].replace(
                          '"__invalid_negative_number__"',
                          'number (>= 0)'
                        )
                      )}", got "${bold(types[1])}".`
                    }
                  }
                  break
                case 2326:
                  const invalidConfig = item.messageText.match(
                    /Types of property '(.+)' are incompatible\./
                  )
                  main += '\n' + ' '.repeat(indent * 2)
                  main += `Invalid configuration${
                    invalidConfig ? ` "${bold(invalidConfig[1])}"` : ''
                  }:`
                  break
                case 2530:
                  const invalidField = item.messageText.match(
                    /Property '(.+)' is incompatible with index signature/
                  )
                  if (invalidField) {
                    main += '\n' + ' '.repeat(indent * 2)
                    main += `"${bold(
                      invalidField[1]
                    )}" is not a valid ${type} export field.`
                  }
                  return
                case 2739:
                  const invalidProp = item.messageText.match(
                    /Type '(.+)' is missing the following properties from type '(.+)'/
                  )
                  if (invalidProp) {
                    if (
                      invalidProp[1] === 'LayoutProps' ||
                      invalidProp[1] === 'PageProps'
                    ) {
                      main += '\n' + ' '.repeat(indent * 2)
                      main += `Prop "${invalidProp[2]}" is incompatible with the ${type}.`
                    }
                  }
                  break
                case 2559:
                  const invalid = item.messageText.match(/Type '(.+)' has/)
                  if (invalid) {
                    main += '\n' + ' '.repeat(indent * 2)
                    main += `Type "${bold(invalid[1])}" isn't allowed.`
                  }
                  break
                case 2741:
                  const incompatPageProp = item.messageText.match(
                    /Property '(.+)' is missing in type 'PageProps'/
                  )
                  if (incompatPageProp) {
                    main += '\n' + ' '.repeat(indent * 2)
                    main += `Prop "${bold(
                      incompatPageProp[1]
                    )}" will never be passed. Remove it from the component's props.`
                  } else {
                    const extraLayoutProp = item.messageText.match(
                      /Property '(.+)' is missing in type 'LayoutProps' but required in type '(.+)'/
                    )
                    if (extraLayoutProp) {
                      main += '\n' + ' '.repeat(indent * 2)
                      main += `Prop "${bold(
                        extraLayoutProp[1]
                      )}" is not valid for this Layout, remove it to fix.`
                    }
                  }
                  break
                default:
              }

              processNext(indent + 1, item.next)
            }
          }

          if ('next' in message) processNext(1, message.next)
          return main
        }

        const invalidExportFnArg = messageText.match(
          /Type 'OmitWithTag<(.+), .+, "(.+)">' does not satisfy the constraint/
        )
        if (invalidExportFnArg) {
          const main = `${type} "${bold(
            relativeSourceFilepath
          )}" has an invalid "${bold(
            invalidExportFnArg[2]
          )}" export:\n  Type "${bold(invalidExportFnArg[1])}" is not valid.`
          return main
        }

        function processNextItems(
          indent: number,
          next?: import('typescript').DiagnosticMessageChain[]
        ) {
          if (!next) return ''

          let result = ''

          for (const item of next) {
            switch (item.code) {
              case 2322:
                const types = item.messageText.match(
                  /Type '(.+)' is not assignable to type '(.+)'./
                )
                if (types) {
                  result += '\n' + ' '.repeat(indent * 2)
                  result += `Expected "${bold(types[2])}", got "${bold(
                    types[1]
                  )}".`
                }
                break
              default:
            }

            result += processNextItems(indent + 1, item.next)
          }

          return result
        }

        const invalidParamFn = messageText.match(
          /Type '{ __tag__: (.+); __param_position__: "(.*)"; __param_type__: (.+); }' does not satisfy/
        )
        if (invalidParamFn) {
          let main = `${type} "${bold(
            relativeSourceFilepath
          )}" has an invalid ${invalidParamFn[1]} export:\n  Type "${bold(
            invalidParamFn[3]
          )}" is not a valid type for the function's ${
            invalidParamFn[2]
          } argument.`

          if ('next' in message) main += processNextItems(1, message.next)
          return main
        }

        const invalidExportFnReturn = messageText.match(
          /Type '{ __tag__: "(.+)"; __return_type__: (.+); }' does not satisfy/
        )
        if (invalidExportFnReturn) {
          let main = `${type} "${bold(
            relativeSourceFilepath
          )}" has an invalid export:\n  "${bold(
            invalidExportFnReturn[2]
          )}" is not a valid ${invalidExportFnReturn[1]} return type:`

          if ('next' in message) main += processNextItems(1, message.next)
          return main
        }

        break
      case 2345:
        const filepathAndInvalidExport = messageText.match(
          /'typeof import\("(.+)"\)'.+Impossible<"(.+)">/
        )
        if (filepathAndInvalidExport) {
          const main = `${type} "${bold(
            relativeSourceFilepath
          )}" exports an invalid "${bold(
            filepathAndInvalidExport[2]
          )}" field. ${type} should only export a default React component and configuration options. Learn more: https://nextjs.org/docs/messages/invalid-segment-export`
          return main
        }
        break
      case 2559:
        const invalid = messageText.match(
          /Type '(.+)' has no properties in common with type '(.+)'/
        )
        if (invalid) {
          const main = `${type} "${bold(
            relativeSourceFilepath
          )}" contains an invalid type "${bold(invalid[1])}" as ${invalid[2]}.`
          return main
        }
        break
      default:
    }
  }
}

function getAppEntrySourceFilePath(
  baseDir: string,
  diagnostic: import('typescript').Diagnostic
) {
  const sourceFilepath =
    diagnostic.file?.text.trim().match(/^\/\/ File: (.+)\n/)?.[1] || ''

  return path.relative(baseDir, sourceFilepath)
}

export function getFormattedDiagnostic(
  ts: typeof import('typescript'),
  baseDir: string,
  distDir: string,
  diagnostic: import('typescript').Diagnostic,
  isAppDirEnabled?: boolean
): string {
  // If the error comes from .next/types/, we handle it specially.
  const isLayoutOrPageError =
    isAppDirEnabled &&
    diagnostic.file?.fileName.startsWith(path.join(baseDir, distDir, 'types'))

  let message = ''

  const appPath = isLayoutOrPageError
    ? getAppEntrySourceFilePath(baseDir, diagnostic)
    : null
  const linkReason = getFormattedLinkDiagnosticMessageText(diagnostic)
  const appReason =
    !linkReason && isLayoutOrPageError && appPath
      ? getFormattedLayoutAndPageDiagnosticMessageText(appPath, diagnostic)
      : null

  const reason =
    linkReason ||
    appReason ||
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
  const category = diagnostic.category
  switch (category) {
    // Warning
    case DiagnosticCategory.Warning: {
      message += yellow(bold('Type warning')) + ': '
      break
    }
    // Error
    case DiagnosticCategory.Error: {
      message += red(bold('Type error')) + ': '
      break
    }
    // 2 = Suggestion, 3 = Message
    case DiagnosticCategory.Suggestion:
    case DiagnosticCategory.Message:
    default: {
      message += cyan(bold(category === 2 ? 'Suggestion' : 'Info')) + ': '
      break
    }
  }

  message += reason + '\n'

  if (!isLayoutOrPageError && diagnostic.file) {
    const { codeFrameColumns } = require('next/dist/compiled/babel/code-frame')
    const pos = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!)
    const line = pos.line + 1
    const character = pos.character + 1

    let fileName = path.posix.normalize(
      path.relative(baseDir, diagnostic.file.fileName).replace(/\\/g, '/')
    )
    if (!fileName.startsWith('.')) {
      fileName = './' + fileName
    }

    message =
      cyan(fileName) +
      ':' +
      yellow(line.toString()) +
      ':' +
      yellow(character.toString()) +
      '\n' +
      message

    message +=
      '\n' +
      codeFrameColumns(
        diagnostic.file.getFullText(diagnostic.file.getSourceFile()),
        {
          start: { line: line, column: character },
        },
        { forceColor: true }
      )
  } else if (isLayoutOrPageError && appPath) {
    message = cyan(appPath) + '\n' + message
  }

  return message
}
