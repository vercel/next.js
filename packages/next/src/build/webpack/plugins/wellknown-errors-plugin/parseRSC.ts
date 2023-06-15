import type { webpack } from 'next/dist/compiled/webpack/webpack'

import { getModuleTrace, formatModuleTrace } from './getModuleTrace'
import { SimpleWebpackError } from './simpleWebpackError'

function formatRSCErrorMessage(
  message: string,
  isPagesDir: boolean,
  fileName: string
): [string, string] {
  let formattedMessage = message
  let formattedVerboseMessage = ''

  // Comes from the "React Server Components" transform in SWC, always
  // attach the module trace.
  const NEXT_RSC_ERR_REACT_API = /.+NEXT_RSC_ERR_REACT_API: (.*?)\n/s
  const NEXT_RSC_ERR_SERVER_IMPORT = /.+NEXT_RSC_ERR_SERVER_IMPORT: (.*?)\n/s
  const NEXT_RSC_ERR_CLIENT_IMPORT = /.+NEXT_RSC_ERR_CLIENT_IMPORT: (.*?)\n/s
  const NEXT_RSC_ERR_CLIENT_METADATA_EXPORT =
    /.+NEXT_RSC_ERR_CLIENT_METADATA_EXPORT: (.*?)\n/s
  const NEXT_RSC_ERR_CONFLICT_METADATA_EXPORT =
    /NEXT_RSC_ERR_CONFLICT_METADATA_EXPORT/s
  const NEXT_RSC_ERR_CLIENT_DIRECTIVE = /.+NEXT_RSC_ERR_CLIENT_DIRECTIVE\n/s
  const NEXT_RSC_ERR_CLIENT_DIRECTIVE_PAREN =
    /.+NEXT_RSC_ERR_CLIENT_DIRECTIVE_PAREN\n/s
  const NEXT_RSC_ERR_INVALID_API = /.+NEXT_RSC_ERR_INVALID_API: (.*?)\n/s
  const NEXT_RSC_ERR_ERROR_FILE_SERVER_COMPONENT =
    /.+NEXT_RSC_ERR_ERROR_FILE_SERVER_COMPONENT/

  if (NEXT_RSC_ERR_REACT_API.test(message)) {
    const matches = message.match(NEXT_RSC_ERR_REACT_API)
    if (matches && matches[1] === 'Component') {
      formattedMessage = `\n\nYou’re importing a class component. It only works in a Client Component but none of its parents are marked with "use client", so they're Server Components by default.\n\n`
    } else {
      formattedMessage = message.replace(
        NEXT_RSC_ERR_REACT_API,
        `\n\nYou're importing a component that needs $1. It only works in a Client Component but none of its parents are marked with "use client", so they're Server Components by default.\n\n`
      )
    }
    formattedVerboseMessage =
      '\n\nMaybe one of these should be marked as a client entry with "use client":\n'
  } else if (NEXT_RSC_ERR_SERVER_IMPORT.test(message)) {
    let shouldAddUseClient = true
    const matches = message.match(NEXT_RSC_ERR_SERVER_IMPORT)
    switch (matches && matches[1]) {
      case 'react-dom/server':
        // If importing "react-dom/server", we should show a different error.
        formattedMessage = `\n\nYou're importing a component that imports react-dom/server. To fix it, render or return the content directly as a Server Component instead for perf and security.`
        break
      case 'next/router':
        // If importing "next/router", we should tell them to use "next/navigation".
        formattedMessage = `\n\nYou have a Server Component that imports next/router. Use next/navigation instead.`
        shouldAddUseClient = false
        break
      default:
        formattedMessage = message.replace(
          NEXT_RSC_ERR_SERVER_IMPORT,
          `\n\nYou're importing a component that imports $1. It only works in a Client Component but none of its parents are marked with "use client", so they're Server Components by default.\n\n`
        )
    }
    formattedVerboseMessage = shouldAddUseClient
      ? '\n\nMaybe one of these should be marked as a client entry "use client":\n'
      : '\n\nImport trace:\n'
  } else if (NEXT_RSC_ERR_CLIENT_IMPORT.test(message)) {
    if (isPagesDir) {
      formattedMessage = message.replace(
        NEXT_RSC_ERR_CLIENT_IMPORT,
        `\n\nYou're importing a component that needs $1. That only works in a Server Component which is not supported in the pages/ directory. Read more: https://nextjs.org/docs/getting-started/react-essentials#server-components\n\n`
      )
      formattedVerboseMessage = '\n\nImport trace for requested module:\n'
    } else {
      formattedMessage = message.replace(
        NEXT_RSC_ERR_CLIENT_IMPORT,
        `\n\nYou're importing a component that needs $1. That only works in a Server Component but one of its parents is marked with "use client", so it's a Client Component.\n\n`
      )
      formattedVerboseMessage =
        '\n\nOne of these is marked as a client entry with "use client":\n'
    }
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
      `\n\n"$1" is not supported in app/. Read more: https://nextjs.org/docs/app/building-your-application/data-fetching\n\n`
    )
    formattedVerboseMessage = '\n\nFile path:\n'
  } else if (NEXT_RSC_ERR_ERROR_FILE_SERVER_COMPONENT.test(message)) {
    formattedMessage = message.replace(
      NEXT_RSC_ERR_ERROR_FILE_SERVER_COMPONENT,
      `\n\n${fileName} must be a Client Component. Add the "use client" directive the top of the file to resolve this issue.\n\n`
    )
    formattedVerboseMessage = '\n\nImport path:\n'
  } else if (NEXT_RSC_ERR_CLIENT_METADATA_EXPORT.test(message)) {
    formattedMessage = message.replace(
      NEXT_RSC_ERR_CLIENT_METADATA_EXPORT,
      `\n\nYou are attempting to export "$1" from a component marked with "use client", which is disallowed. Either remove the export, or the "use client" directive. Read more: https://nextjs.org/docs/getting-started/react-essentials#the-use-client-directive\n\n`
    )

    formattedVerboseMessage = '\n\nFile path:\n'
  } else if (NEXT_RSC_ERR_CONFLICT_METADATA_EXPORT.test(message)) {
    formattedMessage = message.replace(
      NEXT_RSC_ERR_CONFLICT_METADATA_EXPORT,
      `\n\n"metadata" and "generateMetadata" cannot be exported at the same time, please keep one of them. Read more: https://nextjs.org/docs/app/api-reference/file-conventions/metadata\n\n`
    )

    formattedVerboseMessage = '\n\nFile path:\n'
  }

  return [formattedMessage, formattedVerboseMessage]
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
  if (!err.message || !/NEXT_RSC_ERR_/.test(err.message)) {
    return false
  }

  const { isPagesDir, moduleTrace } = getModuleTrace(
    module,
    compilation,
    compiler
  )

  const formattedError = formatRSCErrorMessage(
    err.message,
    isPagesDir,
    fileName
  )

  const { formattedModuleTrace, lastInternalFileName, invalidImportMessage } =
    formatModuleTrace(compiler, moduleTrace)

  const error = new SimpleWebpackError(
    lastInternalFileName,
    'ReactServerComponentsError:\n' +
      formattedError[0] +
      invalidImportMessage +
      formattedError[1] +
      formattedModuleTrace
  )

  // Delete the stack because it's created here.
  error.stack = ''

  return error
}
