import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { createRequire } from 'module'
import path from 'path'
import type ts from 'typescript'
import type { TestEntry } from './contracts'
import type { SerializedDiagnostic } from './reporting/events'
import type {
  TypecheckCompletion,
  TypecheckFileResult,
  TypecheckRequest,
} from './typecheck'

type Mode = 'run' | 'only' | 'skip' | 'todo'
interface Definition {
  id: string
  name: string
  suite: boolean
  start: number
  end: number
  mode: Mode
  parent?: Definition
  children: Definition[]
  errors: SerializedDiagnostic[]
  location: { file: string; line: number; column: number }
}
const intermediate = new Set([
  'each',
  'for',
  'skipIf',
  'runIf',
  'extend',
  'scoped',
  'override',
])
const isTestName = (name: string) =>
  name === 'it' ||
  name === 'test' ||
  name.startsWith('test') ||
  name.endsWith('Test')

/** Collect original syntax without loading declarations, helpers or callbacks. */
function collect(
  typescript: typeof ts,
  source: ts.SourceFile,
  entry: TestEntry,
  projectDir: string
): Definition {
  const imports = new Map<string, string>()
  const namespaces = new Set<string>()
  for (const statement of source.statements) {
    if (
      !typescript.isImportDeclaration(statement) ||
      statement.importClause?.isTypeOnly
    )
      continue
    const bindings = statement.importClause?.namedBindings
    if (bindings && typescript.isNamespaceImport(bindings))
      namespaces.add(bindings.name.text)
    else if (bindings && typescript.isNamedImports(bindings)) {
      for (const specifier of bindings.elements) {
        if (!specifier.isTypeOnly)
          imports.set(
            specifier.name.text,
            specifier.propertyName?.text ?? specifier.name.text
          )
      }
    }
  }
  const chain = (
    node: ts.Expression
  ): { name: string; properties: string[] } | undefined => {
    if (
      typescript.isParenthesizedExpression(node) ||
      typescript.isAsExpression(node) ||
      typescript.isNonNullExpression(node) ||
      typescript.isSatisfiesExpression(node) ||
      typescript.isTypeAssertionExpression(node)
    )
      return chain(node.expression)
    if (typescript.isIdentifier(node))
      return { name: imports.get(node.text) ?? node.text, properties: [] }
    if (typescript.isCallExpression(node)) return chain(node.expression)
    if (typescript.isTaggedTemplateExpression(node)) return chain(node.tag)
    if (typescript.isPropertyAccessExpression(node)) {
      if (
        typescript.isIdentifier(node.expression) &&
        namespaces.has(node.expression.text)
      )
        return { name: node.name.text, properties: [] }
      const parent = chain(node.expression)
      return (
        parent && {
          name: parent.name,
          properties: [...parent.properties, node.name.text],
        }
      )
    }
  }
  const definitions: Definition[] = []
  const visit = (node: ts.Node) => {
    if (typescript.isCallExpression(node) && node.arguments.length) {
      const callee = node.expression
      const functionChain = chain(callee)
      const property = typescript.isPropertyAccessExpression(callee)
        ? callee.name.text
        : undefined
      if (
        functionChain &&
        (isTestName(functionChain.name) ||
          ['describe', 'suite'].includes(functionChain.name)) &&
        !(property && intermediate.has(property)) &&
        !(
          typescript.isPropertyAccessExpression(callee) &&
          typescript.isCallExpression(callee.expression)
        )
      ) {
        const first = node.arguments[0]
        let name = first.getText(source)
        if (
          typescript.isStringLiteralLike(first) ||
          typescript.isNumericLiteral(first) ||
          typescript.isTemplateExpression(first) ||
          [
            typescript.SyntaxKind.TrueKeyword,
            typescript.SyntaxKind.FalseKeyword,
            typescript.SyntaxKind.NullKeyword,
            typescript.SyntaxKind.BigIntLiteral,
            typescript.SyntaxKind.RegularExpressionLiteral,
          ].includes(first.kind)
        )
          name = name.slice(1, -1)
        else if (name.endsWith('.name')) name = name.slice(0, -5)
        let mode: Mode = 'run'
        for (const modifier of functionChain.properties) {
          if (modifier === 'skip' || modifier === 'only' || modifier === 'todo')
            mode = modifier
          else if (modifier === 'skipIf' || modifier === 'runIf') mode = 'skip'
        }
        const options = node.arguments[1]
        if (options && typescript.isObjectLiteralExpression(options)) {
          for (const option of options.properties) {
            if (
              typescript.isPropertyAssignment(option) &&
              typescript.isIdentifier(option.name) &&
              option.initializer.kind === typescript.SyntaxKind.TrueKeyword &&
              ['skip', 'only', 'todo'].includes(option.name.text)
            )
              mode = option.name.text as Mode
          }
        }
        const start =
          typescript.isCallExpression(callee) ||
          typescript.isTaggedTemplateExpression(callee)
            ? callee.end
            : node.getStart(source)
        const location = source.getLineAndCharacterOfPosition(start)
        definitions.push({
          id: '',
          name,
          suite:
            !isTestName(functionChain.name) ||
            functionChain.properties.some(
              (value) => value === 'describe' || value === 'suite'
            ),
          start,
          end: node.end,
          mode,
          children: [],
          errors: [],
          location: {
            file: entry.file,
            line: location.line + 1,
            column: location.character + 1,
          },
        })
      }
    }
    typescript.forEachChild(node, visit)
  }
  visit(source)
  const root: Definition = {
    id: entry.id,
    name: path.relative(projectDir, entry.file).split(path.sep).join('/'),
    suite: true,
    start: 0,
    end: source.end,
    mode: 'run',
    children: [],
    errors: [],
    location: { file: entry.file, line: 1, column: 1 },
  }
  let parent = root
  for (const definition of definitions.sort((a, b) => a.start - b.start)) {
    while (parent.parent && parent.end < definition.start)
      parent = parent.parent
    definition.parent = parent
    definition.id = `${parent.id}/${parent.children.length}`
    if (parent.mode !== 'run') definition.mode = parent.mode
    parent.children.push(definition)
    if (definition.mode === 'only')
      throw new Error(
        `Focused type-test pending-result projection remains unqualified: ${entry.file}. The pinned typechecker does not apply runtime focus selection.`
      )
    if (definition.suite) parent = definition
  }
  return root
}

/** No Next build checker filtering: type-test and source diagnostics are retained. */
function check(request: TypecheckRequest): TypecheckCompletion {
  const requireFromProject = createRequire(
    path.join(request.projectDir, 'package.json')
  )
  let typescript: typeof ts
  try {
    typescript = requireFromProject('typescript') as typeof ts
  } catch {
    throw new Error(
      'Type-test checking requires typescript installed in the test project.'
    )
  }
  const canonical = (file: string) =>
    typescript.sys.realpath?.(path.resolve(file)) ?? path.resolve(file)
  const config = request.project.typecheck!
  const configPath = config.tsconfig
    ? path.resolve(request.projectDir, config.tsconfig)
    : typescript.findConfigFile(request.projectDir, typescript.sys.fileExists)
  if (!configPath)
    throw new Error(
      'Type-test checking requires tsconfig.json in the test project or typecheck.tsconfig.'
    )
  const read = typescript.readConfigFile(configPath, typescript.sys.readFile)
  const parsed = typescript.parseJsonConfigFileContent(
    read.config ?? {},
    typescript.sys,
    path.dirname(configPath),
    undefined,
    configPath
  )
  const options: ts.CompilerOptions = {
    ...parsed.options,
    noEmit: true,
    ...(config.allowJs ? { allowJs: true, checkJs: true } : {}),
  }
  const entries = request.project.entries.filter((entry) => entry.typecheck)
  const selectedSources = new Set(entries.map((entry) => canonical(entry.file)))
  const revisions = new WeakMap<ts.SourceFile, string>()
  const host = typescript.createCompilerHost(options)
  const getSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (
    file,
    languageVersion,
    onError,
    shouldCreateNewSourceFile
  ) => {
    if (!selectedSources.has(canonical(file)))
      return getSourceFile(
        file,
        languageVersion,
        onError,
        shouldCreateNewSourceFile
      )
    // Capture the original bytes at the actual compiler read. SourceFile.text
    // has decoded encodings/BOMs, so hashing that text loses input identity.
    const bytes = readFileSync(file)
    const text =
      bytes[0] === 0xff && bytes[1] === 0xfe
        ? bytes.subarray(2).toString('utf16le')
        : bytes[0] === 0xfe && bytes[1] === 0xff
          ? Buffer.from(bytes.subarray(2)).swap16().toString('utf16le')
          : bytes.toString('utf8').replace(/^\uFEFF/, '')
    const source = typescript.createSourceFile(
      file,
      text,
      languageVersion,
      true
    )
    revisions.set(source, createHash('sha256').update(bytes).digest('hex'))
    return source
  }
  const facades = new Map<string, string>([
    [
      'vitest',
      require
        .resolve('../../../experimental/testing/vitest')
        .replace(/\.js$/, '.d.ts'),
    ],
    [
      'vitest/config',
      require.resolve('./config-api').replace(/\.js$/, '.d.ts'),
    ],
  ])
  // Only compatibility imports resolve to the matching shipped Next facade.
  // Existing compiler paths, project aliases and ordinary application imports
  // retain TypeScript's own resolution and are not patched on disk.
  host.resolveModuleNames = (names, containingFile) =>
    names.map((name) => {
      const facade = facades.get(name)
      return facade
        ? {
            resolvedFileName: facade,
            extension: typescript.Extension.Dts,
            isExternalLibraryImport: true,
          }
        : typescript.resolveModuleName(name, containingFile, options, host)
            .resolvedModule
    })
  const program = typescript.createProgram({
    rootNames: parsed.fileNames,
    options,
    projectReferences: parsed.projectReferences,
    host,
  })
  const files = entries.map((entry) => {
    const source =
      program.getSourceFile(entry.file) ??
      program
        .getSourceFiles()
        .find(
          (candidateSource) =>
            canonical(candidateSource.fileName) === canonical(entry.file)
        )
    if (!source)
      throw new Error(
        `Selected type-test file is not included in the TypeScript program: ${entry.file}. Check tsconfig files/include/exclude and typecheck.include.`
      )
    return {
      entry,
      source,
      root: collect(typescript, source, entry, request.projectDir),
      revision: revisions.get(source),
    }
  })
  const serialize = (error: ts.Diagnostic): SerializedDiagnostic => {
    const start =
      error.file && error.start !== undefined
        ? error.file.getLineAndCharacterOfPosition(error.start)
        : undefined
    return {
      phase: 'compilation',
      severity: 'error',
      name: 'TypeCheckError',
      message: typescript.flattenDiagnosticMessageText(error.messageText, '\n'),
      ...(start && error.file
        ? {
            location: {
              file: path.resolve(error.file.fileName),
              line: start.line + 1,
              column: start.character + 1,
            },
          }
        : {}),
    }
  }
  const diagnostics = [
    ...(read.error ? [read.error] : []),
    ...parsed.errors,
    ...typescript.getPreEmitDiagnostics(program),
  ].filter((error) => error.category === typescript.DiagnosticCategory.Error)
  const sourceErrors: SerializedDiagnostic[] = []
  for (const error of diagnostics) {
    const file =
      error.file &&
      files.find(
        (candidateFile) =>
          canonical(candidateFile.entry.file) ===
          canonical(error.file!.fileName)
      )
    if (!file) {
      if (!config.ignoreSourceErrors || !error.file)
        sourceErrors.push(serialize(error))
      continue
    }
    let owner = file.root
    const locate = (definition: Definition) => {
      for (const child of definition.children) {
        if (
          error.start !== undefined &&
          child.start <= error.start &&
          error.start <= child.end
        ) {
          owner = child
          locate(child)
          break
        }
      }
    }
    locate(file.root)
    owner.errors.push(serialize(error))
  }
  const completion: TypecheckCompletion = { files: [], sourceErrors }
  for (const { entry, root, revision } of files) {
    if (!revision)
      throw new Error(
        `Type-test compiler source identity is missing: ${entry.file}`
      )
    const result: TypecheckFileResult = {
      entryId: entry.id,
      revision,
      status: 'passed',
      durationMs: 0,
      cases: [],
      suites: [],
      errors: root.errors,
    }
    if (!root.children.length)
      result.errors.push({
        phase: 'compilation',
        severity: 'error',
        name: 'TypeCheckError',
        message: `No test suite found in file ${entry.file}`,
      })
    const select = (
      suite: Definition,
      ancestors: { id: string; name: string }[],
      parentSkip: 'skip' | 'todo' | undefined
    ): boolean => {
      let failed = suite.errors.length > 0 && !parentSkip
      for (const task of suite.children) {
        const mode = parentSkip ?? task.mode
        const skip = mode === 'skip' || mode === 'todo' ? mode : undefined
        if (task.suite) {
          const taskFailed = select(
            task,
            [...ancestors, { id: task.id, name: task.name }],
            skip
          )
          result.suites.push({
            entryId: entry.id,
            suiteId: task.id,
            name: task.name,
            ancestors,
            mode: skip ?? 'run',
            status: skip ? 'skipped' : taskFailed ? 'failed' : 'passed',
            errors: task.errors,
            durationMs: 0,
          })
          failed ||= taskFailed
        } else {
          const fullName = [
            ...ancestors.map((ancestor) => ancestor.name),
            task.name,
          ].join(' ')
          // Vitest 5.0.4 typechecker does not apply runtime testNamePattern.
          // TypeScript checks the configured program and reports every type task.
          const selected = !skip
          const errors = [...task.errors]
          const status = selected
            ? errors.length
              ? 'failed'
              : 'passed'
            : 'skipped'
          result.cases.push({
            entryId: entry.id,
            caseId: task.id,
            attempt: { id: `${task.id}:typecheck`, retry: 0, repeat: 0 },
            revision,
            name: fullName,
            testName: task.name,
            ancestors,
            mode: skip ?? 'run',
            location: task.location,
            status,
            errors,
            durationMs: 0,
          })
          failed ||= status === 'failed'
        }
      }
      return !!failed
    }
    if (
      select(root, [{ id: root.id, name: root.name }], undefined) ||
      result.errors.length
    )
      result.status = 'failed'
    result.suites.push({
      entryId: entry.id,
      suiteId: root.id,
      name: root.name,
      ancestors: [],
      mode: 'run',
      status: result.status,
      errors: [],
      durationMs: 0,
    })
    completion.files.push(result)
  }
  return completion
}

let started = false
function onMessage(message: { type?: string; input?: TypecheckRequest }) {
  if (message.type === 'cancel') {
    process.exitCode = 1
    if (process.connected) process.disconnect()
    return
  }
  if (message.type !== 'run' || started || !message.input) {
    process.exitCode = 1
    if (process.connected) process.disconnect()
    return
  }
  started = true
  const request = message.input
  let response: {
    type: string
    id: string
    value?: TypecheckCompletion
    error?: string
  }
  try {
    response = {
      type: 'typecheck-complete',
      id: request.id,
      value: check(request),
    }
  } catch (error) {
    response = {
      type: 'typecheck-complete',
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    }
  }
  process.removeListener('message', onMessage)
  if (process.connected)
    process.send!(response, (error: Error | null) => {
      if (error) process.exitCode = 1
      if (process.connected) process.disconnect()
    })
  else process.exitCode = 1
}
process.on('message', onMessage)
