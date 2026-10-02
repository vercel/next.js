import { expect, test } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

test('consolidates the duplicate lodash runtime', () => {
  const rootPackage = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf8')
  )
  const legacyPackage = JSON.parse(
    readFileSync(
      join(process.cwd(), 'packages/legacy-widget/package.json'),
      'utf8'
    )
  )

  expect(rootPackage.dependencies?.lodash).toBeTruthy()
  expect(legacyPackage.dependencies?.lodash).toBeTruthy()
  expect(legacyPackage.dependencies?.lodash).not.toBe('4.17.20')

  const lockPath = join(process.cwd(), 'package-lock.json')
  expect(existsSync(lockPath)).toBe(true)
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  const versions = new Set<string>()
  for (const [path, entry] of Object.entries(lock.packages ?? {}) as Array<
    [string, { version?: string }]
  >) {
    if (/(?:^|\/)node_modules\/lodash$/.test(path) && entry.version) {
      versions.add(entry.version)
    }
  }
  expect(versions.size).toBe(1)
})

test('preserves both lodash-backed client behaviors', () => {
  const page = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8')
  const legacyWidget = readFileSync(
    join(process.cwd(), 'packages/legacy-widget/index.js'),
    'utf8'
  )

  expect(page).toMatch(/from\s*['"]lodash['"]|require\(['"]lodash['"]\)/)
  expect(page).toMatch(/legacyLabel\s*\(/)
  expect(legacyWidget).toMatch(/require\(['"]lodash['"]\)/)
  expect(legacyWidget).toMatch(/toUpper\s*\(/)
})

test('preserves the two transformed status labels', () => {
  const page = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8')
  const legacyWidget = readFileSync(
    join(process.cwd(), 'packages/legacy-widget/index.js'),
    'utf8'
  )

  expect(page).toContain('Deployment Status')
  expect(page).toContain('Current status:')
  expect(page).toContain('ready for review')
  expect(page).toMatch(/startCase\s*\(/)
  expect(page).toContain('Legacy status:')
  expect(page).toContain('legacy panel')
  expect(page).toMatch(/legacyLabel\s*\(/)
  expect(legacyWidget).toMatch(/toUpper\s*\(/)
  expect(legacyWidget).toMatch(/trim\s*\(/)
})
