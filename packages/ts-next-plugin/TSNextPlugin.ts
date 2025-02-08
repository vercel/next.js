import path from 'path'
import type tsModule from 'typescript/lib/tsserverlibrary'

export class TSNextPlugin {
  ts: typeof tsModule
  info: tsModule.server.PluginCreateInfo
  appDirRegExp: RegExp

  constructor(ts: typeof tsModule, info: tsModule.server.PluginCreateInfo) {
    this.ts = ts
    this.info = info
    this.log('Initializing...')
    const projectDir = info.project.getCurrentDirectory()
    this.log(`Starting Next.js TypeScript plugin: ${projectDir}`)
    this.appDirRegExp = new RegExp(
      `^${`${projectDir}(/src)?/app`.replace(/[\\/]/g, '[\\/]')}`
    )
    this.log('Initialized!')
  }

  log(message: string) {
    this.info.project.projectService.logger.info(`[Next.js] ${message}`)
  }

  getTypeChecker() {
    return this.info.languageService.getProgram()?.getTypeChecker()
  }

  getSource(fileName: string) {
    return this.info.languageService.getProgram()?.getSourceFile(fileName)
  }

  isDefaultFunctionExport(
    node: tsModule.Node
  ): node is tsModule.FunctionDeclaration {
    if (this.ts.isFunctionDeclaration(node)) {
      let hasExportKeyword = false
      let hasDefaultKeyword = false

      if (node.modifiers) {
        for (const modifier of node.modifiers) {
          if (modifier.kind === this.ts.SyntaxKind.ExportKeyword) {
            hasExportKeyword = true
          } else if (modifier.kind === this.ts.SyntaxKind.DefaultKeyword) {
            hasDefaultKeyword = true
          }
        }
      }

      // `export default function`
      if (hasExportKeyword && hasDefaultKeyword) {
        return true
      }
    }
    return false
  }

  isInsideApp(filePath: string) {
    return this.appDirRegExp.test(filePath)
  }

  isAppEntryFile(filePath: string) {
    // question: is this regex is intentionally missing mts, cts, cjs?
    return (
      this.appDirRegExp.test(filePath) &&
      /^(page|layout)\.(mjs|js|jsx|ts|tsx)$/.test(path.basename(filePath))
    )
  }
  isPageFile(filePath: string) {
    // question: is this regex is intentionally missing mts, cts, cjs?
    return (
      this.appDirRegExp.test(filePath) &&
      /^page\.(mjs|js|jsx|ts|tsx)$/.test(path.basename(filePath))
    )
  }

  /** Check if a module is a client entry. */
  getEntryInfo(fileName: string, throwOnInvalidDirective?: boolean) {
    const source = this.getSource(fileName)
    if (source) {
      let isDirective = true
      let isClientEntry = false
      let isServerEntry = false

      this.ts.forEachChild(source!, (node) => {
        if (
          this.ts.isExpressionStatement(node) &&
          this.ts.isStringLiteral(node.expression)
        ) {
          if (node.expression.text === 'use client') {
            if (isDirective) {
              isClientEntry = true
            } else {
              if (throwOnInvalidDirective) {
                const e = {
                  messageText:
                    'The `"use client"` directive must be put at the top of the file.',
                  start: node.expression.getStart(),
                  length: node.expression.getWidth(),
                }
                throw e
              }
            }
          } else if (node.expression.text === 'use server') {
            if (isDirective) {
              isServerEntry = true
            } else {
              if (throwOnInvalidDirective) {
                const e = {
                  messageText:
                    'The `"use server"` directive must be put at the top of the file.',
                  start: node.expression.getStart(),
                  length: node.expression.getWidth(),
                }
                throw e
              }
            }
          }

          if (isClientEntry && isServerEntry) {
            const e = {
              messageText:
                'Cannot use both "use client" and "use server" directives in the same file.',
              start: node.expression.getStart(),
              length: node.expression.getWidth(),
            }
            throw e
          }
        } else {
          isDirective = false
        }
      })

      return { isClientEntry, isServerEntry }
    }

    return { isClientEntry: false, isServerEntry: false }
  }
}
