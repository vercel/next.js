/* global fixture, test */
import 'testcafe'
import { recursiveCopy } from 'next/dist/lib/recursive-copy'
import { join } from 'path'
import fs from 'fs-extra'
import { readFileSync } from 'fs'

const testDir = join(__dirname, 'recursive-folder-test')

const srcDir = join(testDir, 'src')
const destDir = join(testDir, 'dest')

fixture('recursiveCopy')
  .beforeEach(async () => {
    await fs.ensureDir(testDir)

    // create src directory structure
    await fs.ensureDir(srcDir)
    await fs.outputFile(join(srcDir, '.hidden'), 'hidden')
    await fs.outputFile(join(srcDir, 'file'), 'file')
    await fs.outputFile(join(srcDir, 'folder1', 'file1'), 'file1')
    await fs.outputFile(join(srcDir, 'folder1', 'file2'), 'file2')
    await fs.ensureSymlink(join(srcDir, 'file'), join(srcDir, 'link'))
    await fs.ensureSymlink(join(srcDir, 'folder1'), join(srcDir, 'linkfolder'))
  })
  .afterEach(async () => {
    await fs.remove(testDir)
  })

test('should work', async t => {
  await recursiveCopy(srcDir, destDir, {
    filter (path) {
      return path !== '/folder1/file1'
    }
  })

  await t.expect(await fs.pathExists(join(destDir, '.hidden'))).eql(true)
  await t.expect(await fs.pathExists(join(destDir, 'file'))).eql(true)
  await t.expect(await fs.pathExists(join(destDir, 'link'))).eql(true)
  await t
    .expect(await fs.pathExists(join(destDir, 'folder1', 'file1')))
    .eql(false)
  await t
    .expect(await fs.pathExists(join(destDir, 'folder1', 'file2')))
    .eql(true)
  await t
    .expect(await fs.pathExists(join(destDir, 'linkfolder', 'file1')))
    .eql(true)
  await t
    .expect(await fs.pathExists(join(destDir, 'linkfolder', 'file2')))
    .eql(true)

  await t.expect(readFileSync(join(destDir, 'file'), 'utf8')).eql('file')
  await t.expect(readFileSync(join(destDir, 'link'), 'utf8')).eql('file')
  await t
    .expect(readFileSync(join(destDir, 'linkfolder', 'file1'), 'utf8'))
    .eql('file1')
})
