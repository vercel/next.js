import assert from 'node:assert/strict'
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../..')
const require = createRequire(join(repo, 'package.json'))
const {
  createCoverageSourcePlan,
} = require('next/dist/experimental/testing/coverage/source-analysis-plan')
const {
  createTestCompilerSession,
} = require('next/dist/experimental/testing/compiler')
const profile = {
  id: 'dev-import-plan',
  mode: 'development',
  environment: 'browser',
  browserClient: true,
  runtime: 'nodejs',
  bundler: 'turbopack',
}
const rows = []
let closedSessions = 0
for (const name of [
  'no-jsx',
  'type-only-import',
  'stale-source',
  'mutated-plan',
  'foreign-profile',
  'missing-coverage',
  'wrong-mode',
]) {
  const root = await realpath(
    await mkdtemp(join(repo, '.development-import-plan-'))
  )
  let session
  try {
    const subject = join(root, 'subject.tsx')
    const fixture =
      name === 'no-jsx'
        ? 'no-jsx.tsx'
        : name === 'type-only-import'
          ? 'type-only.tsx'
          : 'subject.tsx'
    await writeFile(
      subject,
      await readFile(join(here, 'fixtures/development-import-plan', fixture))
    )
    await writeFile(join(root, 'next.config.mjs'), 'export default {}\n')
    await writeFile(
      join(root, 'package.json'),
      '{"private":true,"type":"module"}\n'
    )
    await mkdir(join(root, 'app'))
    await writeFile(
      join(root, 'app/page.jsx'),
      'export default function Page(){return <p/>}\n'
    )
    await writeFile(
      join(root, 'app/layout.jsx'),
      'export default function Layout({children}){return <html><body>{children}</body></html>}\n'
    )
    const entry = {
      id: 'dev-import-plan:contract.case.mjs',
      file: join(root, 'contract.case.mjs'),
      profile,
    }
    await writeFile(
      entry.file,
      await readFile(
        join(here, 'fixtures/development-import-plan/contract.case.mjs')
      )
    )
    const signal = new AbortController().signal
    const plan = await createCoverageSourcePlan({
      projectDir: root,
      projects: [
        {
          profile,
          entries: [entry],
          include: ['contract.case.mjs'],
          exclude: [],
          setupFiles: [],
        },
      ],
      config: {
        reporter: ['json'],
        include: ['subject.tsx'],
        exclude: [],
        reportsDirectory: 'coverage',
        reportOnFailure: false,
        thresholds: {},
      },
      signal,
    })
    const options = {
      browserCoverageDeclarations: true,
      browserDevelopmentImportPlan: plan,
    }
    if (name === 'wrong-mode') {
      await assert.rejects(
        createTestCompilerSession(
          root,
          { ...profile, mode: 'production' },
          options
        ),
        /Development Browser imports require private planned declaration analysis/
      )
    } else {
      const selectedProfile =
        name === 'foreign-profile' ? { ...profile, id: 'foreign' } : profile
      session = await createTestCompilerSession(root, selectedProfile, options)
      if (name === 'stale-source') await writeFile(subject, '// changed\n')
      if (name === 'mutated-plan') plan.requests[0].revision += '-changed'
      const expected =
        name === 'stale-source'
          ? /Compiler coverage analysis inputs changed after selection/
          : name === 'mutated-plan' || name === 'missing-coverage'
            ? /Development Browser import plan lost its exact compiler context/
            : name === 'foreign-profile'
              ? /Development Browser import plan has a foreign profile/
              : /actual planned JSX value imports/
      await assert.rejects(
        session.compile(
          { ...entry, profile: selectedProfile },
          {
            signal,
            ...(name === 'missing-coverage'
              ? {}
              : { coverage: { version: 1, kind: 'browser-v8' } }),
          }
        ),
        expected
      )
    }
    rows.push(name)
  } finally {
    if (session) {
      await session.dispose()
      closedSessions++
    }
    await rm(root, { recursive: true, force: true })
  }
}
process.stdout.write(
  'NEXT_DEVELOPMENT_IMPORT_PLAN_CONTROLS=' +
    JSON.stringify({ rows, closedSessions }) +
    '\n'
)
