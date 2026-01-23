import { generateDeploymentId } from 'next/dist/build/generate-deployment-id'
import { resolveAndSetDeploymentId } from 'next/dist/build/generate-deployment-id'

describe('generateDeploymentId', () => {
  it('should return undefined when deploymentId is undefined', () => {
    expect(generateDeploymentId(undefined)).toBeUndefined()
  })

  it('should return string when deploymentId is a string', () => {
    expect(generateDeploymentId('my-deployment-123')).toBe('my-deployment-123')
    expect(generateDeploymentId('  my-deployment-123  ')).toBe(
      '  my-deployment-123  '
    )
  })

  it('should call function and return string when deploymentId is a function', () => {
    const fn = () => 'my-deployment-123'
    expect(generateDeploymentId(fn)).toBe('my-deployment-123')

    const fnWithWhitespace = () => '  my-deployment-123  '
    expect(generateDeploymentId(fnWithWhitespace)).toBe('  my-deployment-123  ')
  })

  it('should throw error when function returns non-string', () => {
    const fn = () => 123 as any
    expect(() => generateDeploymentId(fn)).toThrow(
      'deploymentId function must return a string'
    )
  })

  it('should handle function that returns empty string', () => {
    const fn = () => ''
    expect(generateDeploymentId(fn)).toBe('')
  })

  it('should handle empty string deploymentId', () => {
    expect(generateDeploymentId('')).toBe('')
    expect(generateDeploymentId('   ')).toBe('   ')
  })
})

describe('resolveAndSetDeploymentId', () => {
  const originalEnv = process.env.NEXT_DEPLOYMENT_ID

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_DEPLOYMENT_ID
    } else {
      process.env.NEXT_DEPLOYMENT_ID = originalEnv
    }
  })

  describe('Precedence: user-configured vs NEXT_DEPLOYMENT_ID', () => {
    beforeEach(() => {
      delete process.env.NEXT_DEPLOYMENT_ID
    })

    it('should use user-configured deployment ID when both are provided', () => {
      const userDeploymentId = 'my-custom-id'
      const vercelDeploymentId = 'dpl_abc123xyz'

      process.env.NEXT_DEPLOYMENT_ID = vercelDeploymentId

      const result = resolveAndSetDeploymentId(userDeploymentId, 'user-config')
      expect(result).toBe(userDeploymentId)
      expect(process.env.NEXT_DEPLOYMENT_ID).toBe(userDeploymentId)
    })

    it('should use NEXT_DEPLOYMENT_ID when user config is not provided', () => {
      const vercelDeploymentId = 'dpl_abc123xyz'
      process.env.NEXT_DEPLOYMENT_ID = vercelDeploymentId

      const result = resolveAndSetDeploymentId(undefined, 'env-var')
      expect(result).toBe(vercelDeploymentId)
      expect(process.env.NEXT_DEPLOYMENT_ID).toBe(vercelDeploymentId)
    })

    it('should use user-configured function deployment ID over NEXT_DEPLOYMENT_ID', () => {
      const userDeploymentId = 'my-function-id'
      const vercelDeploymentId = 'dpl_abc123xyz'

      process.env.NEXT_DEPLOYMENT_ID = vercelDeploymentId

      const fn = () => userDeploymentId
      const result = resolveAndSetDeploymentId(fn, 'user-config')
      expect(result).toBe(userDeploymentId)
      expect(process.env.NEXT_DEPLOYMENT_ID).toBe(userDeploymentId)
    })

    it('should not error when called twice with Vercel deployment ID from env var', () => {
      const vercelDeploymentId = 'dpl_abc123xyz'
      process.env.NEXT_DEPLOYMENT_ID = vercelDeploymentId

      const firstResult = resolveAndSetDeploymentId(undefined, 'env-var')
      expect(firstResult).toBe(vercelDeploymentId)

      const secondResult = resolveAndSetDeploymentId(firstResult, 'env-var')
      expect(secondResult).toBe(vercelDeploymentId)
    })

    it('should respect explicit source parameter (env-var)', () => {
      const vercelDeploymentId = 'dpl_abc123xyz'
      process.env.NEXT_DEPLOYMENT_ID = vercelDeploymentId

      // Explicitly mark as env-var sourced - should not validate
      const result = resolveAndSetDeploymentId(vercelDeploymentId, 'env-var')
      expect(result).toBe(vercelDeploymentId)
      // Should not throw validation error
    })
  })

  describe('Edge cases: undefined, null, and empty values', () => {
    beforeEach(() => {
      delete process.env.NEXT_DEPLOYMENT_ID
    })

    it('should return empty string when NEXT_DEPLOYMENT_ID is undefined and source is env-var', () => {
      delete process.env.NEXT_DEPLOYMENT_ID
      const result = resolveAndSetDeploymentId(undefined, 'env-var')
      expect(result).toBe('')
    })

    it('should return empty string when NEXT_DEPLOYMENT_ID is empty string and source is env-var', () => {
      process.env.NEXT_DEPLOYMENT_ID = ''
      const result = resolveAndSetDeploymentId(undefined, 'env-var')
      expect(result).toBe('')
    })

    it('should handle empty string user-configured deployment ID (treated as not configured)', () => {
      delete process.env.NEXT_DEPLOYMENT_ID
      const result = resolveAndSetDeploymentId('', 'user-config')
      expect(result).toBe('')
      expect(process.env.NEXT_DEPLOYMENT_ID).toBeUndefined()
    })

    it('should handle function returning empty string for user-configured deployment ID (treated as not configured)', () => {
      process.env.NEXT_DEPLOYMENT_ID = 'env-var-id'
      const fn = () => ''
      const result = resolveAndSetDeploymentId(fn, 'user-config')
      expect(result).toBe('env-var-id')
      expect(process.env.NEXT_DEPLOYMENT_ID).toBe('env-var-id')
    })

    it('should fall back to env var when user-config source but configDeploymentId is undefined', () => {
      process.env.NEXT_DEPLOYMENT_ID = 'env-var-id'
      const result = resolveAndSetDeploymentId(undefined, 'user-config')
      expect(result).toBe('env-var-id')
    })

    it('should return empty string when both user-config and env var are undefined', () => {
      delete process.env.NEXT_DEPLOYMENT_ID
      const result = resolveAndSetDeploymentId(undefined, 'user-config')
      expect(result).toBe('')
    })

    it('should handle user-configured empty string (treated as not configured, falls back to env var)', () => {
      process.env.NEXT_DEPLOYMENT_ID = 'env-var-id'
      const result = resolveAndSetDeploymentId('', 'user-config')
      expect(result).toBe('env-var-id')
      expect(process.env.NEXT_DEPLOYMENT_ID).toBe('env-var-id')
    })

    it('should reject whitespace-only user-configured deployment ID (contains invalid characters)', () => {
      expect(() => resolveAndSetDeploymentId('   ', 'user-config')).toThrow(
        'contains invalid characters'
      )
    })
  })

  describe('Character validation', () => {
    beforeEach(() => {
      delete process.env.NEXT_DEPLOYMENT_ID
    })

    it('should reject deploymentId with invalid characters (spaces)', () => {
      expect(() =>
        resolveAndSetDeploymentId('my deployment id', 'user-config')
      ).toThrow('contains invalid characters')
    })

    it('should reject deploymentId with invalid characters (question mark)', () => {
      expect(() =>
        resolveAndSetDeploymentId('my-deployment?id=123', 'user-config')
      ).toThrow('contains invalid characters')
    })

    it('should reject deploymentId with invalid characters (ampersand)', () => {
      expect(() =>
        resolveAndSetDeploymentId('my-deployment&id=123', 'user-config')
      ).toThrow('contains invalid characters')
    })

    it('should reject deploymentId with invalid characters (percent)', () => {
      expect(() =>
        resolveAndSetDeploymentId('my-deployment%20id', 'user-config')
      ).toThrow('contains invalid characters')
    })

    it('should reject deploymentId with invalid characters (slash)', () => {
      expect(() =>
        resolveAndSetDeploymentId('my/deployment/id', 'user-config')
      ).toThrow('contains invalid characters')
    })

    it('should reject deploymentId with invalid characters (dot)', () => {
      expect(() =>
        resolveAndSetDeploymentId('my.deployment.id', 'user-config')
      ).toThrow('contains invalid characters')
    })

    it('should reject deploymentId with control characters', () => {
      expect(() =>
        resolveAndSetDeploymentId('my-deployment\tid', 'user-config')
      ).toThrow('contains invalid characters')
    })

    it('should allow deploymentId with valid characters (base62 + hyphen + underscore)', () => {
      const result = resolveAndSetDeploymentId(
        'my-deployment_v2-abc123XYZ',
        'user-config'
      )
      expect(result).toBe('my-deployment_v2-abc123XYZ')
      expect(process.env.NEXT_DEPLOYMENT_ID).toBe('my-deployment_v2-abc123XYZ')
    })

    it('should allow deploymentId with only alphanumeric characters', () => {
      const result = resolveAndSetDeploymentId('abc123XYZ789', 'user-config')
      expect(result).toBe('abc123XYZ789')
      expect(process.env.NEXT_DEPLOYMENT_ID).toBe('abc123XYZ789')
    })

    it('should allow deploymentId with only hyphens', () => {
      const result = resolveAndSetDeploymentId('---', 'user-config')
      expect(result).toBe('---')
      expect(process.env.NEXT_DEPLOYMENT_ID).toBe('---')
    })

    it('should allow deploymentId with only underscores', () => {
      const result = resolveAndSetDeploymentId('___', 'user-config')
      expect(result).toBe('___')
      expect(process.env.NEXT_DEPLOYMENT_ID).toBe('___')
    })

    it('should reject deploymentId from function that returns invalid characters', () => {
      const fn = () => 'my deployment id'
      expect(() => resolveAndSetDeploymentId(fn, 'user-config')).toThrow(
        'contains invalid characters'
      )
    })

    it('should allow deploymentId from function that returns valid characters', () => {
      const fn = () => 'my-deployment_v2-abc123XYZ'
      const result = resolveAndSetDeploymentId(fn, 'user-config')
      expect(result).toBe('my-deployment_v2-abc123XYZ')
      expect(process.env.NEXT_DEPLOYMENT_ID).toBe('my-deployment_v2-abc123XYZ')
    })

    it('should allow empty string (treated as not configured)', () => {
      const result = resolveAndSetDeploymentId('', 'user-config')
      expect(result).toBe('')
    })
  })
})
