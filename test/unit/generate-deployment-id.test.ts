import { generateDeploymentId } from 'next/dist/build/generate-deployment-id'

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
