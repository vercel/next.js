import { readFileSync } from 'fs'
import path from 'path'
import { createRequire } from 'module'
import vm from 'vm'
import ts from 'typescript'
import { createTestTypecheckCliArguments } from 'next/dist/experimental/testing/typecheck-cli'
import type { NextTestRunnerOptions } from 'next/dist/cli/next-test-runner'

const { Command, Option } = jest.requireActual<
  typeof import('../../../../packages/next/node_modules/commander')
>('next/dist/compiled/commander')

class ParsedRootCommand extends Command {
  declare rawArgs: string[]
}

export function loadActualTestRunner() {
  const filename = require.resolve('next/dist/cli/next-test-runner')
  const javascript = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      allowJs: true,
    },
  }).outputText
  const localRequire = createRequire(filename)
  const module: {
    exports: {
      nextTestRunner?: typeof import('next/dist/cli/next-test-runner').nextTestRunner
    }
  } = { exports: {} }
  // Lower the actual built entry's dynamic imports into the same Jest registry
  // as its static imports. Resolution stays relative to that real entry.
  vm.runInNewContext(
    javascript,
    {
      module,
      exports: module.exports,
      require(specifier: string) {
        return require(localRequire.resolve(specifier))
      },
      __dirname: path.dirname(filename),
      __filename: filename,
      process,
      console,
      Buffer,
      AbortController,
      structuredClone,
      URL,
      URLSearchParams,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      setImmediate,
      clearImmediate,
    },
    { filename }
  )
  if (typeof module.exports.nextTestRunner !== 'function')
    throw new Error('The actual CLI entry did not export nextTestRunner')
  return module.exports.nextTestRunner
}

function isTestCommand(expression: ts.Expression): boolean {
  if (!ts.isCallExpression(expression)) return false
  const member = expression.expression
  if (!ts.isPropertyAccessExpression(member)) return false
  if (
    member.name.text === 'command' &&
    ts.isIdentifier(member.expression) &&
    member.expression.text === 'program'
  ) {
    return (
      expression.arguments.length > 0 &&
      ts.isStringLiteral(expression.arguments[0]) &&
      expression.arguments[0].text === 'test'
    )
  }
  return isTestCommand(member.expression)
}

function isTestArgvBranch(
  statement: ts.Statement
): statement is ts.IfStatement {
  if (!ts.isIfStatement(statement)) return false
  const condition = statement.expression
  return (
    ts.isBinaryExpression(condition) &&
    condition.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
    ts.isElementAccessExpression(condition.left) &&
    ts.isIdentifier(condition.left.expression) &&
    condition.left.expression.text === 'argv' &&
    ts.isNumericLiteral(condition.left.argumentExpression) &&
    condition.left.argumentExpression.text === '2' &&
    ts.isStringLiteral(condition.right) &&
    condition.right.text === 'test'
  )
}

export async function parseActualTestCommand(args: readonly string[]) {
  // This is the maintained source path. A private runner stages the same layout
  // with the actual proposed files; it does not import the whole CLI entry.
  const filename = path.resolve(
    __dirname,
    '../../../../packages/next/src/bin/next.ts'
  )
  const source = ts.createSourceFile(
    filename,
    readFileSync(filename, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  const variables = new Set([
    'testTypecheckArguments',
    'testWatchArgument',
    'testCoverageArgument',
    'testFileParallelismArgument',
  ])
  const functions = new Set([
    'appendTestWatchArgument',
    'appendTestCoverageArgument',
    'appendTestFileParallelismArgument',
  ])
  const declarations = source.statements.filter((statement) => {
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.some(
        (declaration) =>
          ts.isIdentifier(declaration.name) &&
          variables.has(declaration.name.text)
      )
    }
    return (
      ts.isFunctionDeclaration(statement) &&
      statement.name !== undefined &&
      functions.has(statement.name.text)
    )
  })
  const commands = source.statements.filter(
    (statement): statement is ts.ExpressionStatement =>
      ts.isExpressionStatement(statement) && isTestCommand(statement.expression)
  )
  const argv = source.statements.filter(
    (statement): statement is ts.VariableStatement =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        (declaration) =>
          ts.isIdentifier(declaration.name) && declaration.name.text === 'argv'
      )
  )
  const branches = source.statements.filter(isTestArgvBranch)
  expect(declarations).toHaveLength(7)
  expect(commands).toHaveLength(1)
  expect(argv).toHaveLength(1)
  expect(branches).toHaveLength(1)

  let awaitedParses = 0
  const transformed = ts.transform(branches[0], [
    (context) => {
      const visit: ts.Visitor = (node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'program' &&
          node.expression.name.text === 'parse'
        ) {
          awaitedParses++
          // Await Commander itself so the actual async action and its catch
          // finish. Option registration and argv preprocessing stay unchanged.
          return ts.factory.createAwaitExpression(
            ts.factory.updateCallExpression(
              node,
              ts.factory.updatePropertyAccessExpression(
                node.expression,
                node.expression.expression,
                ts.factory.createIdentifier('parseAsync')
              ),
              node.typeArguments,
              node.arguments
            )
          )
        }
        return ts.visitEachChild(node, visit, context)
      }
      return (node) => ts.visitNode(node, visit) as ts.IfStatement
    },
  ])
  expect(awaitedParses).toBe(2)
  const printer = ts.createPrinter()
  let statementText: string
  try {
    statementText = [
      ...declarations,
      commands[0],
      argv[0],
      transformed.transformed[0],
    ]
      .map((statement) =>
        printer.printNode(ts.EmitHint.Unspecified, statement, source)
      )
      .join('\n')
  } finally {
    transformed.dispose()
  }

  const messages: string[] = []
  const parserOutput: string[] = []
  const processState: { argv: string[]; exitCode?: number } = {
    argv: ['node', 'next', 'test', '/owned/project', '--run', ...args],
  }
  const program = new ParsedRootCommand()
  program.exitOverride()
  program.configureOutput({
    writeOut: (message) => parserOutput.push(message),
    writeErr: (message) => parserOutput.push(message),
  })
  const nextTestRunner = jest.fn(
    async (
      _directory: string | undefined,
      _options: NextTestRunnerOptions
    ) => {}
  )
  const javascript = ts.transpileModule(
    `(async () => { ${statementText} })()`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText
  let parserError: unknown
  try {
    await vm.runInNewContext(javascript, {
      program,
      Option,
      Command,
      createTestTypecheckCliArguments,
      process: processState,
      console: { error: (message: unknown) => messages.push(String(message)) },
      Error,
      AggregateError,
      require(specifier: string) {
        if (specifier === '../cli/next-test-runner.js')
          return { nextTestRunner }
        throw new Error(`Unexpected CLI component import: ${specifier}`)
      },
    })
  } catch (error) {
    parserError = error
  }
  return {
    nextTestRunner,
    parserError,
    messages,
    parserOutput,
    exitCode: processState.exitCode,
    rawArgs: program.rawArgs,
  }
}
