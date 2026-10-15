import { readFile } from 'fs/promises'
import { loadBindings, parse } from '../../build/swc'
import type { DiscoveredTestProject } from './discovery'

interface SyntaxNode {
  type: string
  span: { start: number; end: number }
  value?: unknown
  callee?: SyntaxNode
  tag?: SyntaxNode
  object?: SyntaxNode
  property?: SyntaxNode
  expression?: SyntaxNode
  expressions?: SyntaxNode[]
  arguments?: { expression: SyntaxNode }[]
  properties?: SyntaxNode[]
  key?: SyntaxNode
  body?: SyntaxNode[]
  source?: SyntaxNode
  specifiers?: SyntaxNode[]
  local?: SyntaxNode
  imported?: SyntaxNode
  typeOnly?: boolean
  isTypeOnly?: boolean
}

type Mode = 'run' | 'skip' | 'todo' | 'only'
interface StaticTask {
  suite: boolean
  name: string
  mode: Mode
  start: number
  end: number
  location?: { line: number; column: number }
  parent?: StaticTask
  children: StaticTask[]
  containsOnly?: boolean
  failed?: boolean
}

export interface StaticListedTest {
  name: string
  file: string
  projectName?: string
  location?: { line: number; column: number }
}

function isNode(value: unknown): value is SyntaxNode {
  return !!value && typeof value === 'object' && 'type' in value
}

function identifier(node: SyntaxNode | undefined): string | undefined {
  return node?.type === 'Identifier' && typeof node.value === 'string'
    ? node.value
    : undefined
}

function testName(name: string): boolean {
  return (
    name === 'test' ||
    name === 'it' ||
    name.startsWith('test') ||
    name.endsWith('Test')
  )
}

function declarationName(name: string): boolean {
  return name === 'describe' || name === 'suite' || testName(name)
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

/** Native spans are one-based UTF-8 bytes; public locations are UTF-16 columns. */
function sourceLocations(source: string) {
  const locations = new Map<number, { line: number; column: number }>()
  let byte = 1
  let line = 1
  let column = 1
  for (const character of source) {
    locations.set(byte, { line, column })
    byte += Buffer.byteLength(character)
    if (character === '\n') {
      line++
      column = 1
    } else column += character.length
  }
  locations.set(byte, { line, column })
  return locations
}

async function parseFile(file: string, source: string): Promise<StaticTask> {
  const ast = (await parse(source, { filename: file })) as SyntaxNode
  const bytes = Buffer.from(source)
  const text = (node: SyntaxNode) =>
    bytes.subarray(node.span.start - 1, node.span.end - 1).toString()
  const locations = sourceLocations(source)
  // The compiler rewrites imported aliases to their exported name. Preserve that
  // syntax identity without resolving or evaluating their dependency modules.
  const imports = new Map<string, string>()
  const namespaces = new Set<string>()
  for (const node of ast.body ?? []) {
    if (node.type !== 'ImportDeclaration' || node.typeOnly) continue
    for (const specifier of node.specifiers ?? []) {
      const local = identifier(specifier.local)
      if (!local || specifier.isTypeOnly) continue
      if (specifier.type === 'ImportNamespaceSpecifier') namespaces.add(local)
      else if (specifier.type === 'ImportSpecifier') {
        const imported = identifier(specifier.imported) ?? local
        imports.set(local, imported)
      }
    }
  }
  function unwrap(node: SyntaxNode): SyntaxNode {
    return node.type === 'ParenthesisExpression' ||
      node.type === 'TsAsExpression' ||
      node.type === 'TsSatisfiesExpression' ||
      node.type === 'TsNonNullExpression' ||
      node.type === 'TsTypeAssertion'
      ? unwrap(node.expression!)
      : node
  }
  function callName(value: SyntaxNode | undefined): string | undefined {
    if (!value) return
    const node = unwrap(value)
    const name = identifier(node)
    if (name) return imports.get(name) ?? name
    if (node.type === 'CallExpression') return callName(node.callee)
    if (node.type === 'TaggedTemplateExpression') return callName(node.tag)
    if (node.type === 'MemberExpression') {
      if (node.property?.type === 'Computed') return
      const object = identifier(node.object)
      if (object && namespaces.has(object)) return identifier(node.property)
      return callName(node.object)
    }
    if (
      node.type === 'SequenceExpression' &&
      node.expressions?.length === 2 &&
      node.expressions[0].type === 'NumericLiteral' &&
      node.expressions[0].value === 0
    )
      return callName(node.expressions[1])
  }
  function properties(value: SyntaxNode | undefined): string[] {
    if (!value) return []
    const node = unwrap(value)
    if (node.type === 'CallExpression') return properties(node.callee)
    if (node.type === 'TaggedTemplateExpression') return properties(node.tag)
    if (node.type !== 'MemberExpression') return []
    const property = identifier(node.property)
    return [...properties(node.object), ...(property ? [property] : [])]
  }
  const definitions: StaticTask[] = []
  function visit(node: SyntaxNode) {
    if (node.type === 'CallExpression' && node.callee) {
      const callee = unwrap(node.callee)
      const name = callName(callee)
      const property = identifier(callee.property)
      const message = node.arguments?.[0]?.expression
      if (
        name &&
        declarationName(name) &&
        message &&
        !(property && intermediate.has(property)) &&
        !(
          callee.type === 'MemberExpression' &&
          callee.object?.type === 'CallExpression'
        )
      ) {
        const chain = properties(callee)
        let mode: Mode = 'run'
        for (const part of chain) {
          if (part === 'skip' || part === 'todo' || part === 'only') mode = part
          else if (part === 'skipIf' || part === 'runIf') mode = 'skip'
        }
        const options = node.arguments?.[1]?.expression
        if (options?.type === 'ObjectExpression') {
          for (const option of options.properties ?? []) {
            const key = identifier(option.key)
            if (
              option.type === 'KeyValueProperty' &&
              (key === 'skip' || key === 'todo' || key === 'only') &&
              isNode(option.value) &&
              option.value.type === 'BooleanLiteral' &&
              option.value.value === true
            )
              mode = key
          }
        }
        // Static discovery keeps expressions and parameter placeholders as
        // syntax. No table expansion, conditions or callbacks execute here.
        const literal =
          /^(?:String|Numeric|Boolean|Null|BigInt|RegExp)Literal$/.test(
            message.type
          )
        let label = text(message)
        if (literal || message.type === 'TemplateLiteral')
          label = label.slice(1, -1)
        else if (label.endsWith('.name')) label = label.slice(0, -5)
        const start =
          callee.type === 'CallExpression' ||
          callee.type === 'SequenceExpression' ||
          callee.type === 'TaggedTemplateExpression'
            ? node.callee.span.end
            : node.span.start
        definitions.push({
          suite:
            !testName(name) ||
            chain.includes('describe') ||
            chain.includes('suite'),
          name: label,
          mode,
          start,
          end: node.span.end,
          location: locations.get(start),
          children: [],
        })
      }
    }
    for (const value of Object.values(node)) {
      if (isNode(value)) visit(value)
      else if (Array.isArray(value)) {
        for (const child of value) {
          if (isNode(child)) visit(child)
          else if (child && typeof child === 'object') {
            // SWC wraps call arguments and array elements in expression nodes.
            for (const item of Object.values(child))
              if (isNode(item)) visit(item)
          }
        }
      }
    }
  }
  visit(ast)
  const root: StaticTask = {
    suite: true,
    name: '',
    mode: 'run',
    start: ast.span.start,
    end: ast.span.end,
    children: [],
  }
  let parent = root
  for (const task of definitions.sort(
    (left, right) => left.start - right.start
  )) {
    while (parent.parent && parent.end < task.start) parent = parent.parent
    task.parent = parent
    if (parent.mode !== 'run') task.mode = parent.mode
    parent.children.push(task)
    if (task.mode === 'only') {
      for (
        let ancestor: StaticTask | undefined = parent;
        ancestor;
        ancestor = ancestor.parent
      )
        ancestor.containsOnly = true
    }
    if (task.suite) parent = task
  }
  return root
}

/** Syntax discovery is independent of runtime collection and its resource owners. */
export async function collectStaticTestCases(
  projects: DiscoveredTestProject[],
  options: { signal?: AbortSignal; testNamePattern?: string } = {}
): Promise<{ cases: StaticListedTest[]; errors: string[] }> {
  const selected = projects.flatMap((project) =>
    project.entries.map((entry) => ({ project, entry }))
  )
  const cases: StaticListedTest[] = []
  const errors: string[] = []
  if (!selected.length) return { cases, errors }
  options.signal?.throwIfAborted()
  await loadBindings()
  // Native parser tasks own no compiler/project lock or application realm.
  // Keep the pending native work bounded rather than queueing every file at once.
  const files: {
    project: DiscoveredTestProject
    file: string
    root: StaticTask
  }[] = []
  for (let index = 0; index < selected.length; index += 16) {
    options.signal?.throwIfAborted()
    const parsed = await Promise.all(
      selected.slice(index, index + 16).map(async ({ project, entry }) => {
        try {
          const root = await parseFile(
            entry.file,
            await readFile(entry.file, 'utf8')
          )
          if (!root.children.length)
            errors.push(`No test suite found in file ${entry.file}`)
          return { project, file: entry.file, root }
        } catch (error) {
          errors.push(
            `Failed to parse ${entry.file}: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      })
    )
    options.signal?.throwIfAborted()
    for (const file of parsed) if (file) files.push(file)
  }
  const globalOnly = files.some(({ root }) => root.containsOnly)
  function skipChildren(task: StaticTask, mode: 'skip' | 'todo') {
    for (const child of task.children) {
      if (child.mode === 'run') {
        child.mode = mode
        if (child.suite) skipChildren(child, mode)
      }
    }
  }
  for (const { project, file, root } of files) {
    const pattern = options.testNamePattern ?? project.testNamePattern
    const namePattern = pattern === undefined ? undefined : new RegExp(pattern)
    const allowOnly = project.allowOnly ?? !process.env.CI
    function select(
      suite: StaticTask,
      ancestors: string[],
      parentOnly: boolean
    ) {
      const suiteOnly = parentOnly || suite.mode === 'only'
      const childOnly = globalOnly && suite.containsOnly
      for (const task of suite.children) {
        const included = childOnly
          ? task.mode === 'only' || (task.suite && !!task.containsOnly)
          : suiteOnly || task.mode === 'only'
        if (globalOnly) {
          if (task.mode === 'only') {
            task.mode = 'run'
            if (!allowOnly) {
              task.failed = true
              errors.push(
                `Unexpected .only modifier in ${file}. Remove it or pass --allowOnly.`
              )
            }
          } else if (
            !(task.suite && (included || task.containsOnly)) &&
            task.mode === 'run' &&
            !included
          )
            task.mode = 'skip'
        }
        const names = [...ancestors, task.name]
        if (!task.suite && namePattern && !names.join(' > ').match(namePattern))
          task.mode = 'skip'
        if (task.suite) {
          if (task.mode === 'skip' || task.mode === 'todo')
            skipChildren(task, task.mode)
          else select(task, names, !!included)
        }
      }
    }
    select(root, [], false)
    function list(suite: StaticTask, ancestors: string[]) {
      for (const task of suite.children) {
        const names = [...ancestors, task.name]
        if (task.suite) list(task, names)
        else if (task.failed || (task.mode !== 'skip' && task.mode !== 'todo'))
          cases.push({
            name: names.join(' > '),
            file,
            ...(project.displayName
              ? { projectName: project.displayName }
              : {}),
            ...(task.location ? { location: task.location } : {}),
          })
      }
    }
    list(root, [])
  }
  return { cases, errors }
}
