/* eslint-env jest */
import { nextBuild, deleteBuild } from 'next-test-utils'
import { join } from 'path'
import { readdir, writeFile } from 'fs-extra'

// AppA has keepPastBuilds: true
const appDirA = join(__dirname, '../', 'appA')
// AppB has keepPastBuilds: false
const appDirB = join(__dirname, '../', 'appB')

const indexContentStates = [
  `export default (x) => x * x`,
  `export default (x) => x * x * x`
]

const setIndexContent = async (appDir, state) => {
  await writeFile(join(appDir, 'lib', 'square.js'), indexContentStates[state])
}

const numChunksAfterFirstBuild = {}

describe('Build Persistence', () => {
  beforeAll(async () => {
    await deleteBuild(appDirA)
    await deleteBuild(appDirB)

    await setIndexContent(appDirA, 0)
    await setIndexContent(appDirB, 0)

    await nextBuild(appDirA)
    await nextBuild(appDirB)

    let chunksA = await readdir(join(appDirA, '.next', 'static', 'chunks'))
    numChunksAfterFirstBuild.A = chunksA.length
    let chunksB = await readdir(join(appDirB, '.next', 'static', 'chunks'))
    numChunksAfterFirstBuild.B = chunksB.length

    // adjust a dependency file to force creation of new chunk
    await setIndexContent(appDirA, 1)
    await setIndexContent(appDirB, 1)

    await nextBuild(appDirA)
    await nextBuild(appDirB)
  }, 60000)

  describe('With keepPastBuilds: true', () => {
    it('should keep old static build directories', async () => {
      let folders = await readdir(join(appDirA, '.next', 'static'))
      // Expect 4 folders: chunks, runtime, and two build folders
      expect(folders.length).toBe(4)
    })
    it('should keep old chunks', async () => {
      let files = await readdir(join(appDirA, '.next', 'static', 'chunks'))
      // Should be two copies of the commons chunk in the chunks folder
      expect(files.length).toBeGreaterThan(numChunksAfterFirstBuild.A)
    })
    it('should keep old server build directories', async () => {
      let folders = await readdir(join(appDirA, '.next', 'server', 'static'))
      expect(folders.length).toBe(2)
    })
  })

  describe('With keepPastBuilds: false', () => {
    it('should delete old static build directories', async () => {
      let folders = await readdir(join(appDirB, '.next', 'static'))
      // Expect 3 folders: chunks, runtime, and one build folder
      expect(folders.length).toBe(3)
    })
    it('should not keep old chunks', async () => {
      let files = await readdir(join(appDirB, '.next', 'static', 'chunks'))
      // Should be two copies of the commons chunk in the chunks folder
      expect(files.length).toBe(numChunksAfterFirstBuild.B)
    })
    it('should not keep old server build directories', async () => {
      let folders = await readdir(join(appDirB, '.next', 'server', 'static'))
      expect(folders.length).toBe(1)
    })
  })
})
