import { execFile, type ExecFileException } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { isAbsolute, join } from 'node:path'
async function runPlainNode(
  fixture: string,
  facadePaths: string[],
  compare: (stdout: string) => void
) {
  const requestedEvidence = process.env.NEXT_TESTING_MOCKED_UNIT_EVIDENCE
  if (requestedEvidence && !isAbsolute(requestedEvidence))
    throw new Error(
      'NEXT_TESTING_MOCKED_UNIT_EVIDENCE must be an absolute owned check path'
    )
  if (requestedEvidence) await mkdir(requestedEvidence, { recursive: true })
  const capture = await mkdtemp(
    join(requestedEvidence ?? tmpdir(), 'next-mocked-parent-')
  )
  const args = [
    '--test-reporter=tap',
    '--import',
    require.resolve('tsx'),
    join(__dirname, 'fixtures', fixture),
    ...facadePaths,
  ]
  let passed = false
  try {
    await writeFile(
      join(capture, 'request.json'),
      JSON.stringify({ executable: process.execPath, args })
    )
    const operation = promisify(execFile)(process.execPath, args, {
      timeout: 15000,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8',
    })
    const originalChild = operation.child
    let closeEvent: {
      code: number | null
      signal: NodeJS.Signals | null
    } | null = null
    let stdoutClosed = false
    let stderrClosed = false
    originalChild.once('close', (code, signal) => {
      closeEvent = { code, signal }
    })
    originalChild.stdout?.once('close', () => {
      stdoutClosed = true
    })
    originalChild.stderr?.once('close', () => {
      stderrClosed = true
    })
    let stdout = ''
    let stderr = ''
    let childFailure:
      | (ExecFileException & { stdout?: string; stderr?: string })
      | undefined
    try {
      const actual = await operation
      stdout = actual.stdout
      stderr = actual.stderr
    } catch (error) {
      childFailure = error as typeof childFailure
      stdout = childFailure?.stdout ?? ''
      stderr = childFailure?.stderr ?? ''
    }
    // Persist every actual byte/error/parent-handle observation before parsing,
    // lifecycle or dictionary comparisons. No child JSON supplies this receipt.
    const persistence = await Promise.allSettled([
      writeFile(join(capture, 'stdout.txt'), stdout),
      writeFile(join(capture, 'stderr.txt'), stderr),
      writeFile(
        join(capture, 'parent-receipt.json'),
        JSON.stringify(
          {
            originalChildPID: originalChild.pid ?? null,
            exitCode: originalChild.exitCode,
            signalCode: originalChild.signalCode,
            closeEvent,
            stdinDestroyed: originalChild.stdin?.destroyed ?? true,
            stdoutClosed,
            stderrClosed,
            error: childFailure
              ? {
                  name: childFailure.name,
                  message: childFailure.message,
                  stack: childFailure.stack,
                  code: childFailure.code,
                  signal: childFailure.signal,
                  killed: childFailure.killed,
                }
              : null,
          },
          null,
          2
        )
      ),
    ])
    const persistenceFailures = persistence.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : []
    )
    if (persistenceFailures.length)
      throw new AggregateError(
        [...(childFailure ? [childFailure] : []), ...persistenceFailures],
        'Mocked child result/evidence persistence failed'
      )
    if (childFailure) throw childFailure
    expect(closeEvent).toEqual({ code: 0, signal: null })
    expect(originalChild.exitCode).toBe(0)
    expect(originalChild.signalCode).toBeNull()
    expect(stdoutClosed).toBe(true)
    expect(stderrClosed).toBe(true)
    expect(originalChild.stdin?.destroyed ?? true).toBe(true)
    compare(stdout)
    passed = true
  } catch (error) {
    // Failure evidence survives the child fixture's independent directory cleanup.
    throw new Error(
      `Mocked plain-Node check failed; raw evidence: ${capture}`,
      { cause: error }
    )
  } finally {
    if (passed && !requestedEvidence)
      await rm(capture, { recursive: true, force: true })
  }
}

it('runs the five unchanged identity/routing case predicates in a fresh plain Node realm', async () => {
  await runPlainNode(
    'facade-cases.ts',
    [
      require.resolve('next/dist/experimental/testing/vitest'),
      require.resolve('next/dist/experimental/testing/client/vitest'),
    ],
    (stdout) => {
      expect(stdout).toContain('# tests 5')
      expect(stdout).toContain('# pass 5')
      expect(stdout).toContain('# fail 0')
    }
  )
}, 30000)

it('preserves real mock state and closed-file mutation guards in a fresh plain Node realm', async () => {
  await runPlainNode(
    'ownership-cases.ts',
    [require.resolve('next/dist/experimental/testing/vitest')],
    (stdout) => {
      expect(JSON.parse(stdout)).toEqual({
        module: true,
        collection: true,
        active: true,
        history: true,
        assertionCount: true,
        chain: true,
        closed: true,
        mockReturnValueRefused: true,
        mockClearRefused: true,
        resourcesClosed: true,
      })
    }
  )
}, 30000)

// This maintained check reads fresh Next declarations without evaluating the
// facade; it does not need Vitest installed or add public editor/global aliases.
it('checks the maintained mocked consumer types against actual Next declarations', async () => {
  const requestedEvidence = process.env.NEXT_TESTING_MOCKED_UNIT_EVIDENCE
  if (requestedEvidence && !isAbsolute(requestedEvidence))
    throw new Error(
      'NEXT_TESTING_MOCKED_UNIT_EVIDENCE must be an absolute owned check path'
    )
  if (requestedEvidence) await mkdir(requestedEvidence, { recursive: true })
  const capture = await mkdtemp(
    join(requestedEvidence ?? tmpdir(), 'next-mocked-types-')
  )
  let passed = false
  try {
    const { checkNextTypeControls } = require('./fixtures/check-next-types.cjs')
    const actual = await checkNextTypeControls({
      facadeDts: require
        .resolve('next/dist/experimental/testing/vitest')
        .replace(/\.js$/, '.d.ts'),
      inputDir: join(__dirname, 'types'),
      evidenceDir: capture,
    })
    await writeFile(
      join(capture, 'actual-summary.json'),
      JSON.stringify(actual)
    )
    expect(actual).toEqual({
      programs: 6,
      diagnostics: 0,
      probes: 20,
      complete: true,
    })
    passed = true
  } catch (error) {
    throw new Error(
      `Mocked consumer type check failed; raw evidence: ${capture}`,
      { cause: error }
    )
  } finally {
    if (passed && !requestedEvidence)
      await rm(capture, { recursive: true, force: true })
  }
}, 60000)

// Additive named-export check. The original three runtime/type cases and their
// six-program declaration checker above remain byte-exact.
it('checks all pinned public named mock types through actual common and client declarations', async () => {
  const requestedEvidence = process.env.NEXT_TESTING_MOCKED_UNIT_EVIDENCE
  if (requestedEvidence && !isAbsolute(requestedEvidence))
    throw new Error(
      'NEXT_TESTING_MOCKED_UNIT_EVIDENCE must be an absolute owned check path'
    )
  if (requestedEvidence) await mkdir(requestedEvidence, { recursive: true })
  const capture = await mkdtemp(
    join(requestedEvidence ?? tmpdir(), 'next-named-mock-types-')
  )
  let passed = false
  try {
    const {
      checkNamedMockTypeControls,
    } = require('./fixtures/check-named-mock-types.cjs')
    const declarationRoot =
      process.env.NEXT_TESTING_NAMED_MOCK_TYPES_DECLARATION_ROOT
    if (declarationRoot && !isAbsolute(declarationRoot))
      throw new Error(
        'NEXT_TESTING_NAMED_MOCK_TYPES_DECLARATION_ROOT must be absolute'
      )
    const actual = await checkNamedMockTypeControls({
      commonDts: declarationRoot
        ? join(declarationRoot, 'experimental/testing/vitest.d.ts')
        : require
            .resolve('next/dist/experimental/testing/vitest')
            .replace(/\.js$/, '.d.ts'),
      clientDts: declarationRoot
        ? join(declarationRoot, 'experimental/testing/client/vitest.d.ts')
        : require
            .resolve('next/dist/experimental/testing/client/vitest')
            .replace(/\.js$/, '.d.ts'),
      inputDir: join(__dirname, 'types'),
      evidenceDir: capture,
    })
    await writeFile(
      join(capture, 'actual-summary.json'),
      JSON.stringify(actual)
    )
    expect(actual).toEqual({
      programs: 8,
      positivePrograms: 4,
      observationPrograms: 4,
      positiveDiagnostics: 0,
      probes: 60,
      complete: true,
    })
    passed = true
  } catch (error) {
    throw new Error(`Named mock type check failed; raw evidence: ${capture}`, {
      cause: error,
    })
  } finally {
    if (passed && !requestedEvidence)
      await rm(capture, { recursive: true, force: true })
  }
}, 60000)

// Shipped editor opt-ins are tested from an actual local package installation.
// The repository check layout and its dependency links are not this consumer.
it('resolves the shipped test-only bare, config, globals and import-meta types from installed packages', async () => {
  const requestedEvidence = process.env.NEXT_TESTING_MOCKED_UNIT_EVIDENCE
  if (requestedEvidence && !isAbsolute(requestedEvidence))
    throw new Error(
      'NEXT_TESTING_MOCKED_UNIT_EVIDENCE must be an absolute owned check path'
    )
  if (requestedEvidence) await mkdir(requestedEvidence, { recursive: true })
  const capture = await mkdtemp(
    join(requestedEvidence ?? tmpdir(), 'next-editor-types-')
  )
  let passed = false
  try {
    // Use Node's real package resolver, rather than Jest's createRequire shim.
    const args = [
      join(__dirname, 'fixtures/check-editor-types.cjs'),
      JSON.stringify({
        packageDir: join(require.resolve('next/package.json'), '..'),
        inputDir: join(__dirname, 'editor-types'),
        evidenceDir: capture,
      }),
    ]
    await writeFile(
      join(capture, 'request.json'),
      JSON.stringify({ executable: process.execPath, args })
    )
    const operation = promisify(execFile)(process.execPath, args, {
      timeout: 210000,
      maxBuffer: 16 * 1024 * 1024,
      encoding: 'utf8',
    })
    const child = operation.child
    child.stdin?.end()
    let close: { code: number | null; signal: NodeJS.Signals | null } | null =
      null
    let stdoutClosed = false
    let stderrClosed = false
    child.once('close', (code, signal) => {
      close = { code, signal }
    })
    child.stdout?.once('close', () => {
      stdoutClosed = true
    })
    child.stderr?.once('close', () => {
      stderrClosed = true
    })
    let stdout = ''
    let stderr = ''
    let error:
      | (ExecFileException & { stdout?: string; stderr?: string })
      | undefined
    try {
      const result = await operation
      stdout = result.stdout
      stderr = result.stderr
    } catch (cause) {
      error = cause as typeof error
      stdout = error?.stdout ?? ''
      stderr = error?.stderr ?? ''
    }
    await Promise.all([
      writeFile(join(capture, 'stdout.txt'), stdout),
      writeFile(join(capture, 'stderr.txt'), stderr),
      writeFile(
        join(capture, 'parent-receipt.json'),
        JSON.stringify(
          {
            originalPID: child.pid,
            exitCode: child.exitCode,
            signalCode: child.signalCode,
            close,
            stdoutClosed,
            stderrClosed,
            stdinDestroyed: child.stdin?.destroyed ?? true,
            error: error
              ? {
                  message: error.message,
                  code: error.code,
                  signal: error.signal,
                }
              : null,
          },
          null,
          2
        )
      ),
    ])
    if (error) throw error
    expect(close).toEqual({ code: 0, signal: null })
    expect(child.exitCode).toBe(0)
    expect(child.signalCode).toBeNull()
    expect(stdoutClosed).toBe(true)
    expect(stderrClosed).toBe(true)
    expect(child.stdin?.destroyed ?? true).toBe(true)
    const actual = JSON.parse(
      await require('node:fs/promises').readFile(
        join(capture, 'actual-summary.json'),
        'utf8'
      )
    )
    expect(actual.programs).toEqual([
      {
        name: 'bare',
        types: ['node', 'next/experimental/testing/vitest-global'],
        actualExitCode: 0,
      },
      {
        name: 'config',
        types: ['node', 'next/experimental/testing/vitest-global'],
        actualExitCode: 0,
      },
      {
        name: 'globals',
        types: ['node', 'next/experimental/testing/vitest-globals'],
        actualExitCode: 0,
      },
      {
        name: 'import-meta',
        types: ['node', 'next/experimental/testing/vitest-import-meta'],
        actualExitCode: 0,
      },
      { name: 'ordinary', types: ['node'], actualExitCode: 0 },
      { name: 'without-optin', types: ['node'], actualExitCode: 2 },
      {
        name: 'unsupported-subpath',
        types: ['node', 'next/experimental/testing/vitest-global'],
        actualExitCode: 2,
      },
      {
        name: 'upstream-type-reference',
        types: ['node', 'vitest/globals'],
        actualExitCode: 2,
      },
    ])
    expect(actual.noVitestOrVitePackage).toBe(true)
    expect(actual.customPathsMapping).toBe(false)
    expect(actual.complete).toBe(true)
    passed = true
  } catch (error) {
    throw new Error(`Shipped editor types failed; raw evidence: ${capture}`, {
      cause: error,
    })
  } finally {
    if (passed && !requestedEvidence)
      await rm(capture, { recursive: true, force: true })
  }
}, 240000)

// Public custom-matcher helpers consume the same pinned result types.
it('resolves public matcher-result helper types from a real installed Next package', async () => {
  const requestedEvidence = process.env.NEXT_TESTING_MOCKED_UNIT_EVIDENCE
  if (requestedEvidence && !isAbsolute(requestedEvidence))
    throw new Error(
      'NEXT_TESTING_MOCKED_UNIT_EVIDENCE must be an absolute owned check path'
    )
  if (requestedEvidence) await mkdir(requestedEvidence, { recursive: true })
  const capture = await mkdtemp(
    join(requestedEvidence ?? tmpdir(), 'next-editor-types-')
  )
  let passed = false
  try {
    // Use Node's real package resolver, rather than Jest's createRequire shim.
    const args = [
      join(__dirname, 'fixtures/check-editor-types.cjs'),
      JSON.stringify({
        packageDir: join(require.resolve('next/package.json'), '..'),
        inputDir: join(__dirname, 'editor-types'),
        evidenceDir: capture,
        matcherResultTypes: true,
      }),
    ]
    await writeFile(
      join(capture, 'request.json'),
      JSON.stringify({ executable: process.execPath, args })
    )
    const operation = promisify(execFile)(process.execPath, args, {
      timeout: 210000,
      maxBuffer: 16 * 1024 * 1024,
      encoding: 'utf8',
    })
    const child = operation.child
    child.stdin?.end()
    let close: { code: number | null; signal: NodeJS.Signals | null } | null =
      null
    let stdoutClosed = false
    let stderrClosed = false
    child.once('close', (code, signal) => {
      close = { code, signal }
    })
    child.stdout?.once('close', () => {
      stdoutClosed = true
    })
    child.stderr?.once('close', () => {
      stderrClosed = true
    })
    let stdout = ''
    let stderr = ''
    let error:
      | (ExecFileException & { stdout?: string; stderr?: string })
      | undefined
    try {
      const result = await operation
      stdout = result.stdout
      stderr = result.stderr
    } catch (cause) {
      error = cause as typeof error
      stdout = error?.stdout ?? ''
      stderr = error?.stderr ?? ''
    }
    await Promise.all([
      writeFile(join(capture, 'stdout.txt'), stdout),
      writeFile(join(capture, 'stderr.txt'), stderr),
      writeFile(
        join(capture, 'parent-receipt.json'),
        JSON.stringify(
          {
            originalPID: child.pid,
            exitCode: child.exitCode,
            signalCode: child.signalCode,
            close,
            stdoutClosed,
            stderrClosed,
            stdinDestroyed: child.stdin?.destroyed ?? true,
            error: error
              ? {
                  message: error.message,
                  code: error.code,
                  signal: error.signal,
                }
              : null,
          },
          null,
          2
        )
      ),
    ])
    if (error) throw error
    expect(close).toEqual({ code: 0, signal: null })
    expect(child.exitCode).toBe(0)
    expect(child.signalCode).toBeNull()
    expect(stdoutClosed).toBe(true)
    expect(stderrClosed).toBe(true)
    expect(child.stdin?.destroyed ?? true).toBe(true)
    const actual = JSON.parse(
      await require('node:fs/promises').readFile(
        join(capture, 'actual-summary.json'),
        'utf8'
      )
    )
    expect(actual.programs).toEqual([
      {
        name: 'bare',
        types: ['node', 'next/experimental/testing/vitest-global'],
        actualExitCode: 0,
      },
      {
        name: 'config',
        types: ['node', 'next/experimental/testing/vitest-global'],
        actualExitCode: 0,
      },
      {
        name: 'globals',
        types: ['node', 'next/experimental/testing/vitest-globals'],
        actualExitCode: 0,
      },
      {
        name: 'import-meta',
        types: ['node', 'next/experimental/testing/vitest-import-meta'],
        actualExitCode: 0,
      },
      { name: 'ordinary', types: ['node'], actualExitCode: 0 },
      { name: 'without-optin', types: ['node'], actualExitCode: 2 },
      {
        name: 'unsupported-subpath',
        types: ['node', 'next/experimental/testing/vitest-global'],
        actualExitCode: 2,
      },
      {
        name: 'upstream-type-reference',
        types: ['node', 'vitest/globals'],
        actualExitCode: 2,
      },
      {
        name: 'matcher-results',
        types: ['node', 'next/experimental/testing/vitest-global'],
        actualExitCode: 0,
      },
    ])
    expect(actual.noVitestOrVitePackage).toBe(true)
    expect(actual.customPathsMapping).toBe(false)
    expect(actual.complete).toBe(true)
    expect(actual.matcherResultTypes).toBe(true)
    passed = true
  } catch (error) {
    throw new Error(`Shipped editor types failed; raw evidence: ${capture}`, {
      cause: error,
    })
  } finally {
    if (passed && !requestedEvidence)
      await rm(capture, { recursive: true, force: true })
  }
}, 240000)

it('matches pinned conditional-mock behavior and precise public method types in a fresh Node realm', async () => {
  await runPlainNode('when-cases.ts', [], (stdout) => {
    expect(stdout).toContain('# tests 2')
    expect(stdout).toContain('# pass 2')
    expect(stdout).toContain('# fail 0')
  })
}, 30000)

it('matches pinned conditional-mock exhaustion diagnostics, counts and public types', async () => {
  await runPlainNode('when-exhausted-cases.ts', [], (stdout) => {
    expect(stdout).toContain('# tests 2')
    expect(stdout).toContain('# pass 2')
    expect(stdout).toContain('# fail 0')
  })
}, 30000)

it('preserves helper function types, payloads and soft results in a fresh Node realm', async () => {
  await runPlainNode('define-helper-cases.ts', [], (stdout) => {
    expect(stdout).toContain('# tests 2')
    expect(stdout).toContain('# pass 2')
    expect(stdout).toContain('# fail 0')
  })
}, 30000)
