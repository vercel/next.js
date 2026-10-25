import {
  hasFocusedTests,
  selectedCases,
  type TestCase,
  type TestMode,
  type TestSuite,
} from '../runner/collector'

export interface ClientDeclaration {
  type: 'test' | 'suite'
  id: string
  parentId: string | null
  name: string
  mode: TestMode
  concurrent?: boolean
}

export interface ClientDeclaredCase {
  id: string
  name: string
  testName: string
  ancestors: { id: string; name: string }[]
  suiteId: string
  mode: 'run' | 'skip' | 'todo'
  concurrent?: boolean
}

export interface ClientDeclaredSuite {
  id: string
  name: string
  parentId: string | null
  ancestors: { id: string; name: string }[]
  mode: 'run' | 'skip' | 'todo'
}

/** Copy declaration facts only after the real collector has closed. */
export function clientDeclarations(
  root: TestSuite,
  caseScheduling?: 'concurrent-v1'
): ClientDeclaration[] {
  const declarations: ClientDeclaration[] = []
  function visit(task: TestSuite | TestCase) {
    declarations.push({
      type: task.type,
      id: task.id,
      parentId: task.suite?.id ?? null,
      name: task.name,
      mode: task.mode,
      ...(caseScheduling === 'concurrent-v1'
        ? { concurrent: task.options.concurrent === true }
        : {}),
    })
    if (task.type === 'suite') for (const child of task.children) visit(child)
  }
  visit(root)
  return declarations
}

/** Recompute focus and filtering from immutable declarations and parent options. */
export function resolveClientDeclarations(
  declarations: unknown,
  entryId: string,
  options: {
    testNamePattern?: string | RegExp
    allowOnly?: boolean
    caseScheduling?: 'concurrent-v1'
  }
) {
  const invalid = () =>
    new Error('Invalid Browser Mode collected declarations.')
  if (!Array.isArray(declarations) || !declarations.length) throw invalid()
  const suites = new Map<string, TestSuite>()
  const cases = new Map<string, TestCase>()
  const tasks = new Map<string, TestSuite | TestCase>()
  const path: TestSuite[] = []
  let root: TestSuite | undefined
  for (const declaration of declarations) {
    if (
      !declaration ||
      typeof declaration !== 'object' ||
      Array.isArray(declaration) ||
      Object.keys(declaration).some(
        (key) =>
          ![
            'type',
            'id',
            'parentId',
            'name',
            'mode',
            ...(options.caseScheduling === 'concurrent-v1'
              ? ['concurrent']
              : []),
          ].includes(key)
      ) ||
      !['suite', 'test'].includes(declaration.type) ||
      typeof declaration.id !== 'string' ||
      tasks.has(declaration.id) ||
      typeof declaration.name !== 'string' ||
      !['run', 'skip', 'todo', 'only'].includes(declaration.mode) ||
      (options.caseScheduling === 'concurrent-v1' &&
        typeof declaration.concurrent !== 'boolean')
    )
      throw invalid()
    const parent = suites.get(declaration.parentId)
    while (path.length && path.at(-1) !== parent) path.pop()
    if (
      root
        ? !parent ||
          !path.length ||
          declaration.id !== `${parent.id}/${parent.children.length}`
        : declaration.type !== 'suite' ||
          declaration.id !== entryId ||
          declaration.parentId !== null ||
          declaration.name !== '' ||
          declaration.mode !== 'run'
    )
      throw invalid()
    // This is a metadata graph, never an executable collector. Selection uses
    // the same pure function as the real runner rather than trusting wire modes.
    const task: TestSuite | TestCase =
      declaration.type === 'suite'
        ? {
            type: 'suite',
            id: declaration.id,
            name: declaration.name,
            mode: declaration.mode,
            suite: parent,
            children: [],
            options:
              options.caseScheduling === 'concurrent-v1'
                ? { concurrent: declaration.concurrent }
                : {},
            meta: {},
            tags: [],
            hooks: {
              beforeAll: [],
              afterAll: [],
              beforeEach: [],
              afterEach: [],
            },
            around: { aroundAll: [], aroundEach: [] },
            fixtureOverrides: new Map(),
          }
        : {
            type: 'test',
            id: declaration.id,
            name: declaration.name,
            mode: declaration.mode,
            suite: parent!,
            options:
              options.caseScheduling === 'concurrent-v1'
                ? { concurrent: declaration.concurrent }
                : {},
            fixtures: {},
            meta: {},
            tags: [],
          }
    tasks.set(task.id, task)
    parent?.children.push(task)
    if (task.type === 'suite') {
      suites.set(task.id, task)
      root ??= task
      path.push(task)
    } else cases.set(task.id, task)
  }
  if (!root || (options.allowOnly === false && hasFocusedTests(root)))
    throw invalid()
  const selected = selectedCases(root)
  const pattern =
    options.testNamePattern === undefined
      ? undefined
      : new RegExp(options.testNamePattern)
  const declaredCases = new Map<string, ClientDeclaredCase>()
  const declaredSuites = new Map<string, ClientDeclaredSuite>()
  const parents = (task: TestSuite | TestCase) => {
    const ancestors: TestSuite[] = []
    for (
      let parent = task.suite;
      parent && parent !== root;
      parent = parent.suite
    )
      ancestors.unshift(parent)
    return ancestors
  }
  for (const test of cases.values()) {
    const ancestors = parents(test)
    const fullName = [...ancestors.map((parent) => parent.name), test.name]
      .filter(Boolean)
      .join(' > ')
    let mode = selected.get(test)!
    const filterName = [
      ...ancestors.map((parent) => parent.name),
      test.name,
    ].join(' > ')
    if (mode !== 'skip' && pattern && !pattern.test(filterName)) mode = 'skip'
    declaredCases.set(test.id, {
      id: test.id,
      name: fullName,
      testName: test.name,
      ancestors: ancestors
        .filter((parent) => parent.name)
        .map(({ id, name }) => ({ id, name })),
      suiteId: test.suite.id,
      mode,
      ...(options.caseScheduling === 'concurrent-v1'
        ? { concurrent: test.options.concurrent === true }
        : {}),
    })
  }
  for (const suite of suites.values()) {
    const inherited = suite.suite && declaredSuites.get(suite.suite.id)!.mode
    declaredSuites.set(suite.id, {
      id: suite.id,
      name: suite.name,
      parentId: suite.suite?.id ?? null,
      ancestors: parents(suite).map(({ id, name }) => ({ id, name })),
      mode:
        inherited && inherited !== 'run'
          ? inherited
          : suite.mode === 'only'
            ? 'run'
            : suite.mode,
    })
  }
  return { cases: declaredCases, suites: declaredSuites }
}
