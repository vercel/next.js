/* eslint-env jest */

import { join } from 'path'
import { findPort, launchApp, killApp } from 'next-test-utils'
import { promises as fs } from 'fs'

const appDir = join(__dirname, '..')
const rootTypeDeclarations = join(appDir, 'next-env.d.ts')
const distTypeDeclarations = join(appDir, '.next/dev/types/next-env.d.ts')

describe('TypeScript App Type Declarations', () => {
  it('should not create next-env.d.ts in project root', async () => {
    // Ensure no next-env.d.ts exists before starting
    try {
      await fs.unlink(rootTypeDeclarations)
    } catch {
      // File doesn't exist, which is fine
    }

    const appPort = await findPort()
    let app
    try {
      app = await launchApp(appDir, appPort, {})
      // Verify next-env.d.ts was NOT created in project root
      await expect(fs.access(rootTypeDeclarations)).rejects.toThrow()
    } finally {
      await killApp(app)
    }
  })

  it('should not modify existing next-env.d.ts in project root', async () => {
    const existingContent = '// custom next-env.d.ts content\n'
    await fs.writeFile(rootTypeDeclarations, existingContent)
    const prevStat = await fs.stat(rootTypeDeclarations)

    const appPort = await findPort()
    let app
    try {
      app = await launchApp(appDir, appPort, {})
      // Verify next-env.d.ts was NOT modified
      const stat = await fs.stat(rootTypeDeclarations)
      expect(stat.mtime).toEqual(prevStat.mtime)
      const content = await fs.readFile(rootTypeDeclarations, 'utf8')
      expect(content).toEqual(existingContent)
    } finally {
      await killApp(app)
      // Clean up
      await fs.unlink(rootTypeDeclarations).catch(() => {})
    }
  })

  it('should generate next-env.d.ts in .next/types', async () => {
    // Clean up any existing .next directory
    await fs.rm(join(appDir, '.next'), { recursive: true, force: true })

    const appPort = await findPort()
    let app
    try {
      app = await launchApp(appDir, appPort, {})
      // Verify next-env.d.ts was generated in .next/types
      const content = await fs.readFile(distTypeDeclarations, 'utf8')
      expect(content).toContain('/// <reference types="next" />')
    } finally {
      await killApp(app)
    }
  })
})
