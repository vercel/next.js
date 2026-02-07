import { join } from 'path'
import stripAnsi from 'strip-ansi'
import { File } from 'next-test-utils'

export const context = {
  appDir: join(__dirname, '../'),
  logs: { output: '', stdout: '', stderr: '' },
  api: new File(join(__dirname, '../pages/api/route.js')),
  lib: new File(join(__dirname, '../lib.js')),
  middleware: new File(join(__dirname, '../middleware.js')),
  page: new File(join(__dirname, '../pages/index.js')),
}
export const appOption = {
  onStdout(msg) {
    context.logs.output += msg
    context.logs.stdout += msg
  },
  onStderr(msg) {
    context.logs.output += msg
    context.logs.stderr += msg
  },
}

export function getModuleNotFound(name) {
  return `Module not found: Can't resolve '${name}'`
}

export function getUnsupportedModule(name) {
  return `The edge runtime does not support Node.js '${name}' module`
}

export function getUnsupportedModuleWarning(name) {
  return `A Node.js module is loaded ('${name}'`
}

export function escapeLF(s) {
  return s.replace(/\n/g, '\\n')
}

export function expectUnsupportedModuleProdError(
  moduleName,
  output = context.logs.output
) {
  const moduleNotSupportedMessage = getUnsupportedModule(moduleName)
  expect(output).toContain(moduleNotSupportedMessage)
  const moduleNotFoundMessage = getModuleNotFound(moduleName)
  expect(output).not.toContain(moduleNotFoundMessage)
}

export function expectUnsupportedModuleDevError(
  moduleName,
  importStatement,
  responseText,
  output = context.logs.output
) {
  expectUnsupportedModuleProdError(moduleName, output)
  // Codeframe points to internal frame because this app is not isolated.
  // TODO: Once this test runs in an isolated app, make sure the codeframe includes the import statement
  // expect(stripAnsi(output)).toContain(importStatement)

  const moduleNotSupportedMessage = getUnsupportedModule(moduleName)
  expect(responseText).toContain(escapeLF(moduleNotSupportedMessage))

  const moduleNotFoundMessage = getModuleNotFound(moduleName)
  expect(responseText).not.toContain(escapeLF(moduleNotFoundMessage))
}

export function expectModuleNotFoundProdError(
  moduleName,
  output = context.logs.output
) {
  const moduleNotSupportedMessage = getUnsupportedModule(moduleName)
  expect(stripAnsi(output)).not.toContain(moduleNotSupportedMessage)
  const moduleNotFoundMessages = [
    expect.stringContaining(`Error: Cannot find module '${moduleName}'`),
    expect.stringContaining(getModuleNotFound(moduleName)),
  ]

  expect(moduleNotFoundMessages).toContainEqual(stripAnsi(output))
}

export function expectModuleNotFoundDevError(
  moduleName,
  importStatement,
  responseText,
  output = context.logs.output
) {
  expectModuleNotFoundProdError(moduleName, output)
  expect(stripAnsi(output)).toContain(importStatement)

  const moduleNotSupportedMessage = getUnsupportedModule(moduleName)
  expect(responseText).not.toContain(escapeLF(moduleNotSupportedMessage))

  const moduleNotFoundMessage = getModuleNotFound(moduleName)
  expect(responseText).toContain(escapeLF(moduleNotFoundMessage))
}

export function expectNoError(moduleName) {
  expect(context.logs.output).not.toContain(getUnsupportedModule(moduleName))
  expect(context.logs.output).not.toContain(getModuleNotFound(moduleName))
}
