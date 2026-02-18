/* eslint-env jest */
import path from 'path'
import fs from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import execa from 'execa'

const simpleFixtureDir = path.join(__dirname, 'fixtures', 'simple')
const multipleRootsFixtureDir = path.join(
  __dirname,
  'fixtures',
  'multiple-roots'
)

// Turbopack doesn't use this type generation path (handled in Rust)
describe('root params type generation', () => {
  describe('simple fixture', () => {
    beforeAll(async () => {
      await nextBuild(simpleFixtureDir, [], { stderr: true })
    })

    it('should generate root-params.d.ts with correct types', async () => {
      const dts = (
        await fs.readFile(
          path.join(simpleFixtureDir, '.next', 'types', 'root-params.d.ts')
        )
      ).toString()

      // lang and locale are simple dynamic segments → Promise<string>
      expect(dts).toContain(`export function lang(): Promise<string>`)
      expect(dts).toContain(`export function locale(): Promise<string>`)

      // path appears in catch-all and optional-catch-all → most permissive wins
      expect(dts).toContain(
        `export function path(): Promise<string[] | undefined>`
      )
    })

    it('should include root-params.d.ts import in entry file', async () => {
      const entryFile = (
        await fs.readFile(
          path.join(simpleFixtureDir, '.next', 'types', 'routes.d.ts')
        )
      ).toString()

      expect(entryFile).toContain(`import "./root-params.d.ts"`)
    })

    it('should type-check correctly', async () => {
      const result = await execa('tsc', ['--noEmit'], {
        cwd: simpleFixtureDir,
        reject: false,
      })
      expect(result.stderr).not.toContain('error TS')
      expect(result.stdout).not.toContain('error TS')
    })
  })

  describe('multiple-roots fixture', () => {
    beforeAll(async () => {
      await nextBuild(multipleRootsFixtureDir, [], { stderr: true })
    })

    it('should generate root-params.d.ts with correct types', async () => {
      const dts = (
        await fs.readFile(
          path.join(
            multipleRootsFixtureDir,
            '.next',
            'types',
            'root-params.d.ts'
          )
        )
      ).toString()

      // Only the dashboard subtree has a dynamic segment
      expect(dts).toContain(`export function id(): Promise<string>`)
      // landing layout has no params
      expect(dts).not.toContain('lang')
    })
  })
})
