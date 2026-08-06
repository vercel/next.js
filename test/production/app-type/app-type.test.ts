import { nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('app-type', () => {
  describe('app-only', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixtures', 'app-only'),
    })

    it('should have the app-only app type', async () => {
      const requiredServerFiles = JSON.parse(
        await next.readFile('.next/routes-manifest.json')
      )

      expect(requiredServerFiles.appType).toBe('app')
    })
  })

  describe('pages-only', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixtures', 'pages-only'),
    })

    it('should have the pages-only app type', async () => {
      const requiredServerFiles = JSON.parse(
        await next.readFile('.next/routes-manifest.json')
      )

      expect(requiredServerFiles.appType).toBe('pages')
    })
  })

  describe('hybrid', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixtures', 'hybrid'),
    })

    it('should have the hybrid app type', async () => {
      const requiredServerFiles = JSON.parse(
        await next.readFile('.next/routes-manifest.json')
      )

      expect(requiredServerFiles.appType).toBe('hybrid')
    })
  })
})
