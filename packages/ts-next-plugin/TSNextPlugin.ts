import path from 'path'
import ts from 'typescript'
import { NEXT_TS_ERRORS } from './constant'

export class DirectiveError extends Error {
  category: ts.Diagnostic['category']
  code: ts.Diagnostic['code']
  length: number | undefined
  messageText: ts.Diagnostic['messageText']
  start: number | undefined

  constructor({
    category,
    code,
    length,
    messageText,
    start,
  }: Pick<
    ts.Diagnostic,
    'category' | 'code' | 'length' | 'messageText' | 'start'
  >) {
    super(messageText.toString())
    this.name = 'DirectiveError'
    this.category = category
    this.code = code
    this.length = length
    this.messageText = messageText
    this.start = start
  }
}

export class TSNextPlugin {
  info: ts.server.PluginCreateInfo
  appDirRegExp: RegExp

  constructor(info: ts.server.PluginCreateInfo) {
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
  getEntryInfo(
    fileName: string,
    options: { throwOnInvalidDirective: boolean }
  ) {
    const source = this.getSource(fileName)
    if (source) {
      let isDirective = true
      let isClientEntry = false
      let isServerEntry = false

      ts.forEachChild(source!, (node) => {
        if (
          ts.isExpressionStatement(node) &&
          ts.isStringLiteral(node.expression)
        ) {
          if (node.expression.text === 'use client') {
            if (isDirective) {
              isClientEntry = true
            } else {
              if (options.throwOnInvalidDirective) {
                throw new DirectiveError({
                  ...NEXT_TS_ERRORS.MISPLACED_DIRECTIVE_USE_CLIENT_TOP,
                  start: node.expression.getStart(),
                  length: node.expression.getWidth(),
                })
              }
            }
          }

          if (node.expression.text === 'use server') {
            if (isDirective) {
              isServerEntry = true
            } else {
              if (options.throwOnInvalidDirective) {
                throw new DirectiveError({
                  ...NEXT_TS_ERRORS.MISPLACED_DIRECTIVE_USE_SERVER_TOP,
                  start: node.expression.getStart(),
                  length: node.expression.getWidth(),
                })
              }
            }
          }

          if (isClientEntry && isServerEntry) {
            if (options.throwOnInvalidDirective) {
              throw new DirectiveError({
                ...NEXT_TS_ERRORS.EXTRANEOUS_DIRECTIVE,
                start: node.expression.getStart(),
                length: node.expression.getWidth(),
              })
            }
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
