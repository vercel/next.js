import {
  generateDeploymentId,
  resolveAndSetDeploymentId,
} from 'next/dist/build/generate-deployment-id'

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
  beforeEach(() => {
    delete process.env.NEXT_DEPLOYMENT_ID
  })

  afterEach(() => {
    delete process.env.NEXT_DEPLOYMENT_ID
  })

  it('should reject deploymentId with invalid characters (spaces)', () => {
    expect(() => resolveAndSetDeploymentId('my deployment id')).toThrow(
      'contains invalid characters'
    )
  })

  it('should reject deploymentId with invalid characters (question mark)', () => {
    expect(() => resolveAndSetDeploymentId('my-deployment?id=123')).toThrow(
      'contains invalid characters'
    )
  })

  it('should reject deploymentId with invalid characters (ampersand)', () => {
    expect(() => resolveAndSetDeploymentId('my-deployment&id=123')).toThrow(
      'contains invalid characters'
    )
  })

  it('should reject deploymentId with invalid characters (percent)', () => {
    expect(() => resolveAndSetDeploymentId('my-deployment%20id')).toThrow(
      'contains invalid characters'
    )
  })

  it('should reject deploymentId with invalid characters (slash)', () => {
    expect(() => resolveAndSetDeploymentId('my/deployment/id')).toThrow(
      'contains invalid characters'
    )
  })

  it('should reject deploymentId with invalid characters (dot)', () => {
    expect(() => resolveAndSetDeploymentId('my.deployment.id')).toThrow(
      'contains invalid characters'
    )
  })

  it('should reject deploymentId with control characters', () => {
    expect(() => resolveAndSetDeploymentId('my-deployment\tid')).toThrow(
      'contains invalid characters'
    )
  })

  it('should allow deploymentId with valid characters (base62 + hyphen + underscore)', () => {
    const result = resolveAndSetDeploymentId('my-deployment_v2-abc123XYZ')
    expect(result).toBe('my-deployment_v2-abc123XYZ')
    expect(process.env.NEXT_DEPLOYMENT_ID).toBe('my-deployment_v2-abc123XYZ')
  })

  it('should allow deploymentId with only alphanumeric characters', () => {
    const result = resolveAndSetDeploymentId('abc123XYZ789')
    expect(result).toBe('abc123XYZ789')
    expect(process.env.NEXT_DEPLOYMENT_ID).toBe('abc123XYZ789')
  })

  it('should allow deploymentId with only hyphens', () => {
    const result = resolveAndSetDeploymentId('---')
    expect(result).toBe('---')
    expect(process.env.NEXT_DEPLOYMENT_ID).toBe('---')
  })

  it('should allow deploymentId with only underscores', () => {
    const result = resolveAndSetDeploymentId('___')
    expect(result).toBe('___')
    expect(process.env.NEXT_DEPLOYMENT_ID).toBe('___')
  })

  it('should reject deploymentId from function that returns invalid characters', () => {
    const fn = () => 'my deployment id'
    expect(() => resolveAndSetDeploymentId(fn)).toThrow(
      'contains invalid characters'
    )
  })

  it('should allow deploymentId from function that returns valid characters', () => {
    const fn = () => 'my-deployment_v2-abc123XYZ'
    const result = resolveAndSetDeploymentId(fn)
    expect(result).toBe('my-deployment_v2-abc123XYZ')
    expect(process.env.NEXT_DEPLOYMENT_ID).toBe('my-deployment_v2-abc123XYZ')
  })
})
