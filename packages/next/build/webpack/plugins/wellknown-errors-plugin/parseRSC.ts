import type { webpack } from 'next/dist/compiled/webpack/webpack'

import { relative } from 'path'
import { SimpleWebpackError } from './simpleWebpackError'

function formatRSCErrorMessage(message: string): null | [string, string] {
  if (message && /NEXT_RSC_ERR_/.test(message)) {
    let formattedMessage = message
    let formattedVerboseMessage = ''

    // Comes from the "React Server Components" transform in SWC, always
    // attach the module trace.
    const NEXT_RSC_ERR_REACT_API = /.+NEXT_RSC_ERR_REACT_API: (.*?)\n/s
    const NEXT_RSC_ERR_SERVER_IMPORT = /.+NEXT_RSC_ERR_SERVER_IMPORT: (.*?)\n/s
    const NEXT_RSC_ERR_CLIENT_IMPORT = /.+NEXT_RSC_ERR_CLIENT_IMPORT: (.*?)\n/s
    const NEXT_RSC_ERR_CLIENT_DIRECTIVE = /.+NEXT_RSC_ERR_CLIENT_DIRECTIVE\n/s
    const NEXT_RSC_ERR_CLIENT_DIRECTIVE_PAREN =
      /.+NEXT_RSC_ERR_CLIENT_DIRECTIVE_PAREN\n/s
    const NEXT_RSC_ERR_INVALID_API = /.+NEXT_RSC_ERR_INVALID_API: (.*?)\n/s

    if (NEXT_RSC_ERR_REACT_API.test(message)) {
      formattedMessage = message.replace(
        NEXT_RSC_ERR_REACT_API,
        `\n\nYou're importing a component that needs $1. It only works in a Client Component but none of its parents are marked with "use client", so they're Server Components by default.\n\n`
      )
      formattedVerboseMessage =
        '\n\nMaybe one of these should be marked as a client entry with "use client":\n'
    } else if (NEXT_RSC_ERR_SERVER_IMPORT.test(message)) {
      const matches = message.match(NEXT_RSC_ERR_SERVER_IMPORT)
      switch (matches && matches[1]) {
        case 'react-dom/server':
          // If importing "react-dom/server", we should show a different error.
          formattedMessage = `\n\nYou're importing a component that imports react-dom/server. To fix it, render or return the content directly as a Server Component instead for perf and security.`
          break
        case 'next/router':
          // If importing "next/router", we should tell them to use "next/navigation".
          formattedMessage = `\n\nYou have a Server Component that imports next/router. Use next/navigation instead.`
          break
        default:
          formattedMessage = message.replace(
            NEXT_RSC_ERR_SERVER_IMPORT,
            `\n\nYou're importing a component that imports $1. It only works in a Client Component but none of its parents are marked with "use client", so they're Server Components by default.\n\n`
          )
      }
      formattedVerboseMessage =
        '\n\nMaybe one of these should be marked as a client entry "use client":\n'
    } else if (NEXT_RSC_ERR_CLIENT_IMPORT.test(message)) {
      formattedMessage = message.replace(
        NEXT_RSC_ERR_CLIENT_IMPORT,
        `\n\nYou're importing a component that needs $1. That only works in a Server Component but one of its parents is marked with "use client", so it's a Client Component.\n\n`
      )
      formattedVerboseMessage =
        '\n\nOne of these is marked as a client entry with "use client":\n'
    } else if (NEXT_RSC_ERR_CLIENT_DIRECTIVE.test(message)) {
      formattedMessage = message.replace(
        NEXT_RSC_ERR_CLIENT_DIRECTIVE,
        `\n\nThe "use client" directive must be placed before other expressions. Move it to the top of the file to resolve this issue.\n\n`
      )
      formattedVerboseMessage = '\n\nImport path:\n'
    } else if (NEXT_RSC_ERR_CLIENT_DIRECTIVE_PAREN.test(message)) {
      formattedMessage = message.replace(
        NEXT_RSC_ERR_CLIENT_DIRECTIVE_PAREN,
        `\n\n"use client" must be a directive, and placed before other expressions. Remove the parentheses and move it to the top of the file to resolve this issue.\n\n`
      )
      formattedVerboseMessage = '\n\nImport path:\n'
    } else if (NEXT_RSC_ERR_INVALID_API.test(message)) {
      formattedMessage = message.replace(
        NEXT_RSC_ERR_INVALID_API,
        `\n\n"$1" is not supported in app/. Read more: https://beta.nextjs.org/docs/data-fetching/fundamentals\n\n`
      )
      formattedVerboseMessage = '\n\nFile path:\n'
    }

    return [formattedMessage, formattedVerboseMessage]
  }

  return null
}

// Check if the error is specifically related to React Server Components.
// If so, we'll format the error message to be more helpful.
export function getRscError(
  fileName: string,
  err: Error,
  module: any,
  compilation: webpack.Compilation,
  compiler: webpack.Compiler
): SimpleWebpackError | false {
  const formattedError = formatRSCErrorMessage(err.message)
  if (!formattedError) return false

  // Get the module trace:
  // https://cs.github.com/webpack/webpack/blob/9fcaa243573005d6fdece9a3f8d89a0e8b399613/lib/stats/DefaultStatsFactoryPlugin.js#L414
  const visitedModules = new Set()
  const moduleTrace = []

  let current = module
  while (current) {
    if (visitedModules.has(current)) break
    visitedModules.add(current)
    moduleTrace.push(current)
    const origin = compilation.moduleGraph.getIssuer(current)
    if (!origin) break
    current = origin
  }

  const error = new SimpleWebpackError(
    fileName,
    formattedError[0] +
      formattedError[1] +
      moduleTrace
        .map((m) =>
          m.resource
            ? '  ' + relative(compiler.context, m.resource).replace(/\?.+$/, '')
            : ''
        )
        .filter(Boolean)
        .join('\n')
  )

  // Delete the stack because it's created here.
  error.stack = ''

  return error
}
