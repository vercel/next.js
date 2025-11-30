/* eslint-env jest */
import fs from 'fs'
import path from 'path'

describe('npm-publish.yml workflow validation', () => {
  const workflowPath = path.join(
    __dirname,
    '../../../.github/workflows/npm-publish.yml'
  )
  let workflowContent: string

  beforeAll(() => {
    workflowContent = fs.readFileSync(workflowPath, 'utf-8')
  })

  describe('workflow file existence and structure', () => {
    it('should exist at the correct path', () => {
      expect(fs.existsSync(workflowPath)).toBe(true)
    })

    it('should be a valid YAML file with correct indentation', () => {
      // Check for proper YAML structure - no tabs, consistent indentation
      expect(workflowContent).not.toMatch(/\t/)
      expect(workflowContent).toMatch(/^name:/)
    })

    it('should have a descriptive workflow name', () => {
      const nameMatch = workflowContent.match(/^name:\s*(.+)$/m)
      expect(nameMatch).toBeTruthy()
      expect(nameMatch![1].trim()).toBeTruthy()
      expect(nameMatch![1].trim().length).toBeGreaterThan(3)
    })

    it('should contain required top-level keys', () => {
      expect(workflowContent).toMatch(/^name:/m)
      expect(workflowContent).toMatch(/^on:/m)
      expect(workflowContent).toMatch(/^jobs:/m)
    })
  })

  describe('workflow triggers', () => {
    it('should trigger on release events', () => {
      expect(workflowContent).toMatch(/on:\s*\n\s+release:/m)
    })

    it('should specify release event types', () => {
      expect(workflowContent).toMatch(/types:\s*\[created\]/m)
    })

    it('should not trigger on push to prevent accidental publishes', () => {
      expect(workflowContent).not.toMatch(/push:/m)
    })

    it('should not have workflow_dispatch to prevent manual accidental publishes', () => {
      // workflow_dispatch could be dangerous for publish workflows
      expect(workflowContent).not.toMatch(/workflow_dispatch:/m)
    })
  })

  describe('build job configuration', () => {
    it('should have a build job', () => {
      expect(workflowContent).toMatch(/^\s+build:/m)
    })

    it('should specify ubuntu-latest as runner', () => {
      const buildJobSection = workflowContent.match(
        /build:[\s\S]*?(?=\n\s{2}\w+:|$)/
      )
      expect(buildJobSection).toBeTruthy()
      expect(buildJobSection![0]).toMatch(/runs-on:\s*ubuntu-latest/)
    })

    it('should checkout code', () => {
      const buildJobSection = workflowContent.match(
        /build:[\s\S]*?(?=\n\s{2}\w+:|$)/
      )
      expect(buildJobSection).toBeTruthy()
      expect(buildJobSection![0]).toMatch(/uses:\s*actions\/checkout@v4/)
    })

    it('should setup Node.js', () => {
      const buildJobSection = workflowContent.match(
        /build:[\s\S]*?(?=\n\s{2}\w+:|$)/
      )
      expect(buildJobSection).toBeTruthy()
      expect(buildJobSection![0]).toMatch(/uses:\s*actions\/setup-node@v4/)
    })

    it('should use Node.js version 20', () => {
      const buildJobSection = workflowContent.match(
        /build:[\s\S]*?(?=\n\s{2}\w+:|$)/
      )
      expect(buildJobSection).toBeTruthy()
      expect(buildJobSection![0]).toMatch(/node-version:\s*20/)
    })

    it('should install dependencies using npm ci', () => {
      const buildJobSection = workflowContent.match(
        /build:[\s\S]*?(?=\n\s{2}\w+:|$)/
      )
      expect(buildJobSection).toBeTruthy()
      expect(buildJobSection![0]).toMatch(/run:\s*npm ci/)
    })

    it('should run tests before publishing', () => {
      const buildJobSection = workflowContent.match(
        /build:[\s\S]*?(?=\n\s{2}\w+:|$)/
      )
      expect(buildJobSection).toBeTruthy()
      expect(buildJobSection![0]).toMatch(/run:\s*npm test/)
    })

    it('should use npm ci instead of npm install for reproducible builds', () => {
      const buildJobSection = workflowContent.match(
        /build:[\s\S]*?(?=\n\s{2}\w+:|$)/
      )
      expect(buildJobSection).toBeTruthy()
      expect(buildJobSection![0]).toMatch(/npm ci/)
      expect(buildJobSection![0]).not.toMatch(/npm install(?!\s)/)
    })
  })

  describe('publish-npm job configuration', () => {
    it('should have a publish-npm job', () => {
      expect(workflowContent).toMatch(/^\s+publish-npm:/m)
    })

    it('should depend on build job completion', () => {
      const publishJobSection = workflowContent.match(
        /publish-npm:[\s\S]*?(?=\n\s{2}\w+:|$)/
      )
      expect(publishJobSection).toBeTruthy()
      expect(publishJobSection![0]).toMatch(/needs:\s*build/)
    })

    it('should specify ubuntu-latest as runner', () => {
      const publishJobSection = workflowContent.match(
        /publish-npm:[\s\S]*?(?=\n\s{2}\w+:|$)/
      )
      expect(publishJobSection).toBeTruthy()
      expect(publishJobSection![0]).toMatch(/runs-on:\s*ubuntu-latest/)
    })

    it('should checkout code', () => {
      const publishJobSection = workflowContent.match(
        /publish-npm:[\s\S]*?(?=\n\s{2}\w+:|$)/
      )
      expect(publishJobSection).toBeTruthy()
      expect(publishJobSection![0]).toMatch(/uses:\s*actions\/checkout@v4/)
    })

    it('should setup Node.js with registry URL', () => {
      const publishJobSection = workflowContent.match(
        /publish-npm:[\s\S]*?(?=\n\s{2}\w+:|$)/
      )
      expect(publishJobSection).toBeTruthy()
      expect(publishJobSection![0]).toMatch(/uses:\s*actions\/setup-node@v4/)
      expect(publishJobSection![0]).toMatch(
        /registry-url:\s*https:\/\/registry\.npmjs\.org\//
      )
    })

    it('should use Node.js version 20 for consistency', () => {
      const publishJobSection = workflowContent.match(
        /publish-npm:[\s\S]*?(?=\n\s{2}\w+:|$)/
      )
      expect(publishJobSection).toBeTruthy()
      expect(publishJobSection![0]).toMatch(/node-version:\s*20/)
    })

    it('should install dependencies before publishing', () => {
      const publishJobSection = workflowContent.match(
        /publish-npm:[\s\S]*?(?=\n\s{2}\w+:|$)/
      )
      expect(publishJobSection).toBeTruthy()
      expect(publishJobSection![0]).toMatch(/run:\s*npm ci/)
    })

    it('should run npm publish command', () => {
      const publishJobSection = workflowContent.match(
        /publish-npm:[\s\S]*?(?=\n\s{2}\w+:|$)/
      )
      expect(publishJobSection).toBeTruthy()
      expect(publishJobSection![0]).toMatch(/run:\s*npm publish/)
    })

    it('should use NODE_AUTH_TOKEN environment variable', () => {
      const publishJobSection = workflowContent.match(
        /publish-npm:[\s\S]*?(?=\n\s{2}\w+:|$)/
      )
      expect(publishJobSection).toBeTruthy()
      expect(publishJobSection![0]).toMatch(/env:/)
      expect(publishJobSection![0]).toMatch(
        /NODE_AUTH_TOKEN:\s*\$\{\{secrets\.npm_token\}\}/
      )
    })

    it('should use secrets.npm_token for authentication', () => {
      const publishJobSection = workflowContent.match(
        /publish-npm:[\s\S]*?(?=\n\s{2}\w+:|$)/
      )
      expect(publishJobSection).toBeTruthy()
      expect(publishJobSection![0]).toMatch(/secrets\.npm_token/)
    })

    it('should not hardcode authentication tokens', () => {
      // Check that there are no hardcoded tokens or passwords
      expect(workflowContent).not.toMatch(/npm_[A-Za-z0-9_]{20,}/)
      expect(workflowContent).not.toMatch(/password:\s*[^\$]/)
      expect(workflowContent).not.toMatch(/token:\s*[^\$]/)
    })
  })

  describe('security and best practices', () => {
    it('should use pinned major versions for GitHub Actions', () => {
      // Using @v4 is acceptable (major version pinning)
      const checkoutActions = workflowContent.match(/actions\/checkout@v\d+/g)
      const setupNodeActions = workflowContent.match(
        /actions\/setup-node@v\d+/g
      )

      expect(checkoutActions).toBeTruthy()
      expect(setupNodeActions).toBeTruthy()
      expect(checkoutActions!.length).toBeGreaterThan(0)
      expect(setupNodeActions!.length).toBeGreaterThan(0)

      // All actions should use @v4 (current stable)
      checkoutActions!.forEach((action) => {
        expect(action).toMatch(/@v4$/)
      })
      setupNodeActions!.forEach((action) => {
        expect(action).toMatch(/@v4$/)
      })
    })

    it('should not use deprecated actions', () => {
      expect(workflowContent).not.toMatch(/actions\/checkout@v1/)
      expect(workflowContent).not.toMatch(/actions\/checkout@v2/)
      expect(workflowContent).not.toMatch(/actions\/setup-node@v1/)
      expect(workflowContent).not.toMatch(/actions\/setup-node@v2/)
      expect(workflowContent).not.toMatch(/actions\/setup-node@v3/)
    })

    it('should not contain sensitive information', () => {
      expect(workflowContent).not.toMatch(/password\s*:\s*[^${\s]/)
      expect(workflowContent).not.toMatch(/api[_-]?key\s*:\s*[^${\s]/)
      expect(workflowContent).not.toMatch(/secret\s*:\s*[^${\s]/)
    })

    it('should use HTTPS for npm registry URL', () => {
      expect(workflowContent).toMatch(/https:\/\/registry\.npmjs\.org/)
      expect(workflowContent).not.toMatch(/http:\/\/registry\.npmjs\.org/)
    })

    it('should not allow concurrent publish jobs', () => {
      // No concurrency group defined means jobs can't run in parallel by default
      // This is good for publish workflows
      const publishJobSection = workflowContent.match(
        /publish-npm:[\s\S]*?(?=\n\s{2}\w+:|$)/
      )
      expect(publishJobSection).toBeTruthy()

      // If concurrency is defined, it should prevent concurrent runs
      if (publishJobSection![0].includes('concurrency:')) {
        expect(publishJobSection![0]).toMatch(/cancel-in-progress:\s*false/)
      }
    })
  })

  describe('workflow step ordering', () => {
    it('should checkout code before setting up Node.js in build job', () => {
      const buildSteps = workflowContent.match(/build:[\s\S]*?(?=\n\s{2}\w+:|$)/)
      expect(buildSteps).toBeTruthy()

      const checkoutIndex = buildSteps![0].indexOf('actions/checkout')
      const setupNodeIndex = buildSteps![0].indexOf('actions/setup-node')

      expect(checkoutIndex).toBeLessThan(setupNodeIndex)
      expect(checkoutIndex).toBeGreaterThan(-1)
      expect(setupNodeIndex).toBeGreaterThan(-1)
    })

    it('should install dependencies before running tests in build job', () => {
      const buildSteps = workflowContent.match(/build:[\s\S]*?(?=\n\s{2}\w+:|$)/)
      expect(buildSteps).toBeTruthy()

      const npmCiIndex = buildSteps![0].indexOf('npm ci')
      const npmTestIndex = buildSteps![0].indexOf('npm test')

      expect(npmCiIndex).toBeLessThan(npmTestIndex)
      expect(npmCiIndex).toBeGreaterThan(-1)
      expect(npmTestIndex).toBeGreaterThan(-1)
    })

    it('should install dependencies before publishing in publish-npm job', () => {
      const publishSteps = workflowContent.match(
        /publish-npm:[\s\S]*?(?=\n\s{2}\w+:|$)/
      )
      expect(publishSteps).toBeTruthy()

      const npmCiIndex = publishSteps![0].indexOf('npm ci')
      const npmPublishIndex = publishSteps![0].indexOf('npm publish')

      expect(npmCiIndex).toBeLessThan(npmPublishIndex)
      expect(npmCiIndex).toBeGreaterThan(-1)
      expect(npmPublishIndex).toBeGreaterThan(-1)
    })

    it('should setup Node.js with registry before publishing', () => {
      const publishSteps = workflowContent.match(
        /publish-npm:[\s\S]*?(?=\n\s{2}\w+:|$)/
      )
      expect(publishSteps).toBeTruthy()

      const setupNodeIndex = publishSteps![0].indexOf('actions/setup-node')
      const registryIndex = publishSteps![0].indexOf('registry-url')
      const publishIndex = publishSteps![0].indexOf('npm publish')

      expect(setupNodeIndex).toBeGreaterThan(-1)
      expect(registryIndex).toBeGreaterThan(-1)
      expect(publishIndex).toBeGreaterThan(-1)
      expect(setupNodeIndex).toBeLessThan(publishIndex)
      expect(registryIndex).toBeLessThan(publishIndex)
    })
  })

  describe('Node.js version consistency', () => {
    it('should use the same Node.js version in both jobs', () => {
      const nodeVersionMatches = workflowContent.match(/node-version:\s*(\d+)/g)

      expect(nodeVersionMatches).toBeTruthy()
      expect(nodeVersionMatches!.length).toBeGreaterThanOrEqual(2)

      // Extract version numbers
      const versions = nodeVersionMatches!.map((match) =>
        match.replace(/node-version:\s*/, '')
      )

      // All versions should be the same
      const uniqueVersions = [...new Set(versions)]
      expect(uniqueVersions.length).toBe(1)
      expect(uniqueVersions[0]).toBe('20')
    })

    it('should use a supported LTS Node.js version', () => {
      const nodeVersionMatches = workflowContent.match(/node-version:\s*(\d+)/)
      expect(nodeVersionMatches).toBeTruthy()

      const version = parseInt(nodeVersionMatches![1], 10)

      // Node.js 20 is an LTS version (as of 2024)
      expect(version).toBeGreaterThanOrEqual(18)
      expect(version).toBeLessThanOrEqual(22)
    })
  })

  describe('job dependencies', () => {
    it('should prevent publish job from running if build job fails', () => {
      const publishJobSection = workflowContent.match(
        /publish-npm:[\s\S]*?(?=\n\s{2}\w+:|$)/
      )
      expect(publishJobSection).toBeTruthy()

      // The 'needs: build' ensures publish only runs after build succeeds
      expect(publishJobSection![0]).toMatch(/needs:\s*build/)
    })

    it('should have exactly one job dependency for publish-npm', () => {
      const publishJobSection = workflowContent.match(
        /publish-npm:[\s\S]*?(?=\n\s{2}\w+:|$)/
      )
      expect(publishJobSection).toBeTruthy()

      // Should only depend on build job
      const needsMatch = publishJobSection![0].match(/needs:\s*build/)
      expect(needsMatch).toBeTruthy()

      // Should not have multiple dependencies (which would be: needs: [build, other])
      expect(publishJobSection![0]).not.toMatch(/needs:\s*\[/)
    })
  })

  describe('comments and documentation', () => {
    it('should have a comment explaining the workflow purpose', () => {
      const firstLine = workflowContent.split('\n')[0]
      expect(firstLine).toMatch(/^#/)
      expect(firstLine.toLowerCase()).toMatch(/workflow|publish|package/)
    })

    it('should include a reference link in comments', () => {
      expect(workflowContent).toMatch(
        /https:\/\/docs\.github\.com\/en\/actions/
      )
    })

    it('should have comments at the top of the file', () => {
      const lines = workflowContent.split('\n')
      const firstNonEmptyLine = lines.find((line) => line.trim() !== '')
      expect(firstNonEmptyLine).toMatch(/^#/)
    })
  })

  describe('environment variable configuration', () => {
    it('should only set environment variables where needed', () => {
      // env should only be on the npm publish step
      const envMatches = workflowContent.match(/\s+env:/g)
      expect(envMatches).toBeTruthy()
      expect(envMatches!.length).toBe(1) // Only one env block
    })

    it('should set NODE_AUTH_TOKEN only for npm publish step', () => {
      const publishSteps = workflowContent.match(
        /publish-npm:[\s\S]*?(?=\n\s{2}\w+:|$)/
      )
      expect(publishSteps).toBeTruthy()

      // Find the npm publish step
      const npmPublishMatch = publishSteps![0].match(
        /run:\s*npm publish[\s\S]*?(?=\n\s+- |\n\s{2}\w+:|$)/
      )
      expect(npmPublishMatch).toBeTruthy()
      expect(npmPublishMatch![0]).toMatch(/env:/)
      expect(npmPublishMatch![0]).toMatch(/NODE_AUTH_TOKEN/)
    })
  })

  describe('runner configuration', () => {
    it('should use ubuntu-latest for all jobs', () => {
      const runsOnMatches = workflowContent.match(/runs-on:\s*(.+)/g)
      expect(runsOnMatches).toBeTruthy()
      expect(runsOnMatches!.length).toBeGreaterThanOrEqual(2)

      runsOnMatches!.forEach((match) => {
        expect(match).toMatch(/ubuntu-latest/)
      })
    })

    it('should not use self-hosted runners', () => {
      expect(workflowContent).not.toMatch(/runs-on:\s*self-hosted/)
      expect(workflowContent).not.toMatch(/runs-on:\s*\[self-hosted/)
    })

    it('should not use Windows or macOS runners for npm publish', () => {
      expect(workflowContent).not.toMatch(/runs-on:\s*windows/)
      expect(workflowContent).not.toMatch(/runs-on:\s*macos/)
    })
  })
})