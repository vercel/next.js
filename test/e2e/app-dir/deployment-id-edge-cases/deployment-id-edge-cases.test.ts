import { nextTestSetup } from 'e2e-utils'

describe('deployment-id-edge-cases', () => {
  describe('platform deployment scenarios', () => {
    it('should work with Vercel-style deployment IDs', async () => {
      const vercelDeploymentId = 'dpl_abc123DEF456ghi789jkl012'
      const { next } = nextTestSetup({
        files: __dirname,
        env: {
          NEXT_DEPLOYMENT_ID: vercelDeploymentId,
        },
        skipStart: true,
      })

      await next.build()
      await next.start()

      const $ = await next.render$('/')
      expect($('p').text()).toBe(`Deployment ID: ${vercelDeploymentId}`)
    })

    it('should work with Netlify-style deployment IDs', async () => {
      const netlifyDeploymentId = 'deploy_1234567890abcdef'
      const { next } = nextTestSetup({
        files: __dirname,
        env: {
          NEXT_DEPLOYMENT_ID: netlifyDeploymentId,
        },
        skipStart: true,
      })

      await next.build()
      await next.start()

      const $ = await next.render$('/')
      expect($('p').text()).toBe(`Deployment ID: ${netlifyDeploymentId}`)
    })

    it('should work with Railway-style deployment IDs', async () => {
      const railwayDeploymentId = 'railway-deployment-12345'
      const { next } = nextTestSetup({
        files: __dirname,
        env: {
          NEXT_DEPLOYMENT_ID: railwayDeploymentId,
        },
        skipStart: true,
      })

      await next.build()
      await next.start()

      const $ = await next.render$('/')
      expect($('p').text()).toBe(`Deployment ID: ${railwayDeploymentId}`)
    })

    it('should work with custom platform deployment IDs containing special chars', async () => {
      const customDeploymentId = 'my-app.production.v2.1.domain.com'
      const { next } = nextTestSetup({
        files: __dirname,
        env: {
          NEXT_DEPLOYMENT_ID: customDeploymentId,
        },
        skipStart: true,
      })

      await next.build()
      await next.start()

      const $ = await next.render$('/')
      expect($('p').text()).toBe(`Deployment ID: ${customDeploymentId}`)
    })
  })

  describe('production deployment edge cases', () => {
    it('should handle deployment ID in ISR scenarios', async () => {
      const deploymentId = 'isr-test-123'
      const { next } = nextTestSetup({
        files: __dirname,
        env: {
          NEXT_DEPLOYMENT_ID: deploymentId,
        },
        skipStart: true,
      })

      await next.build()
      await next.start()

      // Test initial render
      const $ = await next.render$('/')
      expect($('p').text()).toBe(`Deployment ID: ${deploymentId}`)

      // Test revalidation doesn't break deployment ID
      const response = await next.fetch('/')
      expect(response.status).toBe(200)
    })

    it('should work with static optimization', async () => {
      const deploymentId = 'static-opt-456'
      const { next } = nextTestSetup({
        files: __dirname,
        env: {
          NEXT_DEPLOYMENT_ID: deploymentId,
        },
        skipStart: true,
      })

      await next.build()
      await next.start()

      const response = await next.fetch('/')
      expect(response.status).toBe(200)

      const $ = await next.render$('/')
      expect($('p').text()).toBe(`Deployment ID: ${deploymentId}`)
    })

    it('should handle deployment ID with preview deployments', async () => {
      const previewDeploymentId = 'preview-branch-feature-x'
      const { next } = nextTestSetup({
        files: __dirname,
        env: {
          NEXT_DEPLOYMENT_ID: previewDeploymentId,
        },
        skipStart: true,
      })

      await next.build()
      await next.start()

      const $ = await next.render$('/')
      expect($('p').text()).toBe(`Deployment ID: ${previewDeploymentId}`)
    })

    it('should work with long deployment IDs from CI/CD systems', async () => {
      const ciDeploymentId =
        'github-actions-deployment-2024-01-23-12-34-56-abcdef123456'
      const { next } = nextTestSetup({
        files: __dirname,
        env: {
          NEXT_DEPLOYMENT_ID: ciDeploymentId,
        },
        skipStart: true,
      })

      await next.build()
      await next.start()

      const $ = await next.render$('/')
      expect($('p').text()).toBe(`Deployment ID: ${ciDeploymentId}`)
    })
  })

  describe('mixed configuration scenarios', () => {
    it('should prioritize config over environment in production', async () => {
      const configId = 'config-wins'
      const envId = 'env-ignored'

      const { next } = nextTestSetup({
        files: {
          ...require(__dirname),
          'next.config.js': `
            module.exports = {
              deploymentId: '${configId}'
            }
          `,
        },
        env: {
          NEXT_DEPLOYMENT_ID: envId,
        },
        skipStart: true,
      })

      await next.build()
      await next.start()

      const $ = await next.render$('/')
      expect($('p').text()).toBe(`Deployment ID: ${configId}`)
    })

    it('should use environment variable when config is minimal', async () => {
      const envId = 'env-variable-used'
      const { next } = nextTestSetup({
        files: __dirname,
        env: {
          NEXT_DEPLOYMENT_ID: envId,
        },
        skipStart: true,
      })

      await next.build()
      await next.start()

      const $ = await next.render$('/')
      expect($('p').text()).toBe(`Deployment ID: ${envId}`)
    })
  })

  describe('error handling in deployment', () => {
    it('should handle missing deployment ID gracefully', async () => {
      const { next } = nextTestSetup({
        files: __dirname,
        skipStart: true,
      })

      await next.build()
      await next.start()

      const $ = await next.render$('/')
      expect($('p').text()).toBe('Deployment ID: undefined')
    })

    it('should handle empty deployment ID', async () => {
      const { next } = nextTestSetup({
        files: __dirname,
        env: {
          NEXT_DEPLOYMENT_ID: '',
        },
        skipStart: true,
      })

      await next.build()
      await next.start()

      const $ = await next.render$('/')
      expect($('p').text()).toBe('Deployment ID: undefined')
    })
  })
})
