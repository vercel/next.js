/* eslint-env jest */

import { dirname, join } from 'path'
import { findPort, launchApp, killApp } from 'next-test-utils'
import { promises as fs } from 'fs'

const appDir = join(__dirname, '..')
const origAppTypeDeclarations = join(appDir, 'next-env.d.ts')
const appTypeDeclarations = join(appDir, '.next', 'next-env.d.ts')

describe('TypeScript App Type Declarations', () => {
  it('should write a new next-env.d.ts if none exist', async () => {
    const origContent = await fs.readFile(origAppTypeDeclarations, 'utf8')
    const appPort = await findPort()
    let app
    await fs.unlink(appTypeDeclarations).catch(() => {})
    try {
      app = await launchApp(appDir, appPort, {})
      const content = await fs.readFile(appTypeDeclarations, 'utf8')
      expect(content).toEqual(origContent)
    } finally {
      await killApp(app)
    }
  })

  it('should overwrite next-env.d.ts if an incorrect one exists', async () => {
    const prevContent = await fs.readFile(origAppTypeDeclarations, 'utf8')
    await fs.mkdir(dirname(appTypeDeclarations), { recursive: true })
    await fs.writeFile(appTypeDeclarations, prevContent + 'modification')
    const appPort = await findPort()
    let app
    try {
      app = await launchApp(appDir, appPort, {})
      const content = await fs.readFile(appTypeDeclarations, 'utf8')
      expect(content).toEqual(prevContent)
    } finally {
      await killApp(app)
    }
  })

  it('should not touch an existing correct next-env.d.ts', async () => {
    const prevContent = await fs.readFile(origAppTypeDeclarations, 'utf8')
    await fs.mkdir(dirname(appTypeDeclarations), { recursive: true })
    await fs.writeFile(appTypeDeclarations, prevContent)
    const prevStat = await fs.stat(appTypeDeclarations)
    const appPort = await findPort()
    let app
    try {
      app = await launchApp(appDir, appPort, {})
      const stat = await fs.stat(appTypeDeclarations)
      expect(stat.mtime).toEqual(prevStat.mtime)
    } finally {
      await killApp(app)
    }
  })
})
