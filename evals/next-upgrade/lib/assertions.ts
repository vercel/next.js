import { afterAll, test, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'

const tools = '/tmp/next-upgrade-tools'
const json = (file: string) => JSON.parse(readFileSync(file, 'utf8'))
const git = (...args: string[]) =>
  execFileSync('git', args, { encoding: 'utf8' }).trim()
const lines = (name: string): any[] =>
  existsSync(join(tools, name))
    ? readFileSync(join(tools, name), 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : []
const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (
      ['node_modules', '.git', '.next', '__agent_eval__'].includes(
        entry.name
      ) ||
      /(?:EVAL|assertions\.test)\.ts$/.test(entry.name)
    )
      return []
    const file = join(directory, entry.name)
    return entry.isDirectory()
      ? sourceFiles(file)
      : /\.[cm]?[jt]sx?$/.test(entry.name)
        ? [file]
        : []
  })

// Extract tool inputs only. Printed context/output mentioning a guide is not a read.
function toolCommands(transcript: string): string[] {
  const commands: string[] = []
  function visit(event: any) {
    if (!event || typeof event !== 'object') return
    if (event.type === 'command_execution' && typeof event.command === 'string')
      commands.push(event.command)
    // Native Codex TUI sessions record executed argv, unlike exec's JSON stream.
    if (event.type === 'CommandExecution' && Array.isArray(event.command))
      commands.push(event.command.join(' '))
    if (event.type === 'tool_use') {
      if (typeof event.input?.command === 'string')
        commands.push(event.input.command)
      if (event.name === 'Read' && typeof event.input?.file_path === 'string')
        commands.push(`readFile ${event.input.file_path}`)
    }
    if (event.type === 'function_call' && typeof event.arguments === 'string') {
      try {
        const input = JSON.parse(event.arguments)
        if (typeof input.cmd === 'string') commands.push(input.cmd)
        if (typeof input.command === 'string') commands.push(input.command)
        if (typeof input.code === 'string') commands.push(input.code)
      } catch {}
    }
    for (const key of ['payload', 'item', 'message']) visit(event[key])
    if (Array.isArray(event.content)) event.content.forEach(visit)
  }
  for (const line of transcript.split('\n')) {
    try {
      visit(JSON.parse(line))
    } catch {}
  }
  return commands
}

export function runAssertions() {
  // Capture the agent's state before runtime grading can rewrite generated files
  // such as next-env.d.ts. Keep the post-grading state distinct in the artifact.
  const agentRepository = {
    head: git('rev-parse', 'HEAD'),
    uncommittedPatch: git('diff', '--binary', 'HEAD'),
    status: git('status', '--short'),
  }
  // agent-eval captures the diff against HEAD. Completed upgrades are already
  // committed, so retain their parent-relative evidence after all assertions.
  // This withheld artifact is never visible to the agent or its completion checks.
  afterAll(() => {
    const baseline = json(`${tools}/baseline.json`)
    const head = git('rev-parse', 'HEAD')
    const commits = git('rev-list', '--reverse', `${baseline.head}..${head}`)
      .split('\n')
      .filter(Boolean)
      .map((commit) => ({
        sha: commit,
        parent: git('rev-parse', `${commit}^`),
        message: git('show', '-s', '--format=%B', commit),
        patch: git('show', '--format=', '--binary', commit),
      }))
    writeFileSync(
      'UPGRADE_EVIDENCE.json',
      JSON.stringify(
        {
          baselineHead: baseline.head,
          head: agentRepository.head,
          commits,
          uncommittedPatch: agentRepository.uncommittedPatch,
          status: agentRepository.status,
          postGradingRepository: {
            head,
            uncommittedPatch: git('diff', '--binary', 'HEAD'),
            status: git('status', '--short'),
          },
          providerReads: lines('provider-reads.jsonl'),
          publicationAttempts: lines('publication-attempts.jsonl'),
          backgroundSession: existsSync(`${tools}/background-session.json`)
            ? json(`${tools}/background-session.json`)
            : null,
          codemodRuns: lines('codemod-runs.jsonl'),
          packets: lines('packets.jsonl').map((packet) => ({
            context: json(packet.contextPath),
            report: existsSync(join(dirname(packet.contextPath), 'RESULT.md'))
              ? readFileSync(
                  join(dirname(packet.contextPath), 'RESULT.md'),
                  'utf8'
                )
              : null,
          })),
        },
        null,
        2
      )
    )
  })
  test('completes the actual upgrade workflow for this scenario', async () => {
    const scenario = json('scenario.json')
    const baseline = json(`${tools}/baseline.json`)
    // Refreshing context can produce a new packet. The agent may retain its
    // report in the original one; observe all packets instead of last-write wins.
    const packet = lines('packets.jsonl')
      .reverse()
      .find((entry) =>
        existsSync(join(dirname(entry.contextPath), 'RESULT.md'))
      )
    expect(
      packet,
      'a recorded upgrade packet must contain the result'
    ).toBeDefined()
    const context = json(packet.contextPath)
    const report = readFileSync(
      join(dirname(packet.contextPath), 'RESULT.md'),
      'utf8'
    )
    const transcript = readFileSync(`${tools}/agent-transcript.txt`, 'utf8')
    const commands = toolCommands(transcript)
    const agent = json(`${tools}/agent-result.json`)
    const providers = lines('provider-reads.jsonl')
    const codemods = lines('codemod-runs.jsonl').filter(
      (run) => !run.args.includes('--help')
    )
    expect(
      lines('entrypoints.jsonl').some(
        (entry) =>
          entry.args.includes('upgrade') &&
          entry.args.includes('--experimental-agent') &&
          entry.args.includes('--experimental-agent-dry-run')
      )
    ).toBe(true)
    expect(context.dryRun).toBe(true)
    expect(
      lines('publication-attempts.jsonl'),
      'dry-run must not attempt publication'
    ).toEqual([])
    expect(agent.entry).toBe(scenario.entry)
    const launches = lines('harness-launches.jsonl')
    expect(launches).toHaveLength(scenario.entry === 'terminal' ? 1 : 0)
    if (launches.length) {
      expect(launches[0].command).toBe(baseline.harness)
      const { UPGRADE_MODELS } = require(`${tools}/next/node_modules/next/dist/lib/upgrade/models`)
      const modelIndex = launches[0].args.indexOf('--model')
      expect(modelIndex).toBeGreaterThanOrEqual(0)
      expect(launches[0].args[modelIndex + 1]).toBe(
        UPGRADE_MODELS[baseline.harness]
      )
      expect(json(`${tools}/background-session.json`)).toMatchObject({
        harness: baseline.harness,
        launcherExitCode: 0,
        completed: true,
      })
    }
    // Keep independent findings visible when an earlier prerequisite fails.
    expect
      .soft(
        providers.map((read) => read.command),
        'establish the selected repository, base and app before matching PRs'
      )
      .toContain('repository')
    expect
      .soft(providers.map((read) => read.command))
      .toContain('list-open-prs')
    expect(context.app.nextVersion).toBe(scenario.source)
    expect(context.targetVersion).toBe(scenario.target)
    expect(git('remote')).toBe('')

    if (scenario.id === 'existing-pr' || scenario.id === 'lookup-blocked') {
      expect
        .soft(codemods, 'stop cases must not run migration codemods')
        .toHaveLength(0)
      expect
        .soft(git('rev-parse', 'HEAD'), 'stop cases must not create commits')
        .toBe(baseline.head)
      expect
        .soft(
          git('diff', '--name-only', baseline.head),
          'stop cases must not change the app'
        )
        .toBe('')
      if (scenario.id === 'existing-pr') {
        expect
          .soft(providers)
          .toContainEqual(
            expect.objectContaining({ command: 'inspect-pr', args: ['41'] })
          )
        expect.soft(report).toMatch(/\bskipped-existing-pr\b/i)
        expect.soft(report).toContain('41')
      } else {
        expect.soft(report).toMatch(/\bblocked\b/i)
        expect.soft(report).toMatch(/lookup|provider|duplicate|read access/i)
        expect.soft(report).toMatch(/restore|retry|resume|access|available/i)
      }
      expect.soft(report).not.toMatch(/\bverified-local\b/i)
      return
    }

    expect(agent.ok).toBe(true)
    expect
      .soft(report, 'only complete migrations may report verified-local')
      .toMatch(/\bverified-local\b/i)
    expect(report).not.toMatch(
      /published (?:a |the )?PR|https:\/\/github.com\/[^\s]+\/pull\/\d+/i
    )
    expect(codemods.length).toBeGreaterThan(0)
    const lookupAt = providers.find(
      (read) => read.command === 'list-open-prs'
    ).at
    expect(Date.parse(codemods[0].at)).toBeGreaterThanOrEqual(
      Date.parse(lookupAt)
    )
    expect(codemods[0].args).toEqual(
      expect.arrayContaining([
        'upgrade',
        scenario.target,
        '--yes',
        '--skip-adoption',
      ])
    )
    const requireFromApp = createRequire(join(process.cwd(), 'package.json'))
    expect(json(requireFromApp.resolve('next/package.json')).version).toBe(
      scenario.target
    )
    const manifest = json('package.json')
    expect(manifest.dependencies.next).toBe(scenario.target)
    const next = json(requireFromApp.resolve('next/package.json'))
    const react = json(requireFromApp.resolve('react/package.json'))
    const reactDom = json(requireFromApp.resolve('react-dom/package.json'))
    const { satisfies } = requireFromApp('next/dist/compiled/semver')
    expect(react.version).toBe(reactDom.version)
    expect(satisfies(react.version, next.peerDependencies.react)).toBe(true)
    expect(
      satisfies(reactDom.version, next.peerDependencies['react-dom'])
    ).toBe(true)
    expect(satisfies(react.version, reactDom.peerDependencies.react)).toBe(true)
    // The stable target predates this experimental option. A config warning
    // does not authorize deleting the app's opted-in security policy.
    expect
      .soft(
        requireFromApp('./next.config.js').default.experimental
          ?.agenticAutoUpgrade,
        'preserve the configured security-upgrade policy'
      )
      .toBe('security')
    const source = sourceFiles(process.cwd())
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')
    expect(source).not.toMatch(
      /@next-codemod-error|UnsafeUnwrapped(?:Cookies|Headers|DraftMode)/
    )
    expect(source).not.toMatch(
      /cacheComponents\s*:\s*true|partialPrefetching\s*:\s*true|export\s+const\s+instant\s*=/
    )
    expect(git('diff', '--name-only', 'HEAD')).toBe('')
    const commits = git('rev-list', '--reverse', `${baseline.head}..HEAD`)
      .split('\n')
      .filter(Boolean)
    // This direct transition needs one complete, independently usable commit.
    expect(commits).toHaveLength(1)
    const message = git('show', '-s', '--format=%B', commits[0])
    expect(message).toMatch(/Upgrade.*Next/i)
    expect(message).toContain(scenario.source)
    expect(message).toContain(scenario.target)
    expect(message).toMatch(/Why\?/i)
    expect(message).toMatch(/How\?/i)
    expect(git('show', '--format=', '--name-only', commits[0])).toContain(
      'pnpm-lock.yaml'
    )
    for (const guide of context.docs.guides) {
      expect(existsSync(join(context.docs.root, guide))).toBe(true)
      // Require guide retrieval in the actual transcript, not merely a RESULT claim.
      expect
        .soft(
          commands.some(
            (command) =>
              /cat|sed|head|rg|readFile|read_file/.test(command) &&
              command.includes(guide.split('/').pop()!)
          ),
          `retrieve the selected migration guide: ${guide}`
        )
        .toBe(true)
    }
    expect(
      commands.some(
        (command) =>
          /pnpm|next|runtime\.cjs/.test(command) &&
          /dev|build|start|check:runtime|runtime\.cjs/.test(command)
      )
    ).toBe(true)
    const { checkApp } = requireFromApp(`${tools}/runtime.cjs`)
    if (scenario.major) {
      expect(json(`${tools}/controls.json`)).toMatchObject({
        emittedMarker: true,
        markerOnlyFailed: true,
        unmarkedRepairRequired: true,
        repaired: { requestIsolation: true, imageQuality: 60 },
      })
      expect(readFileSync('lib/viewer.ts', 'utf8')).toMatch(
        /async\s+function\s+readViewer|readViewer\s*=\s*async/
      )
      expect(readFileSync('app/page.tsx', 'utf8')).toMatch(
        /await\s+readViewer\(/
      )
      await expect(
        checkApp(process.cwd(), true, 'start')
      ).resolves.toMatchObject({ requestIsolation: true, imageQuality: 60 })
    } else {
      expect(manifest.scripts.build).toBeUndefined()
      await expect(checkApp(process.cwd(), false)).resolves.toEqual({
        pages: true,
      })
    }
  }, 300000)
}

runAssertions()
