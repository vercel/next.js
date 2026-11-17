import local from 'local'
import dep from 'dep'

it('should find the package that a tsconfig extends with the package map', () => {
  // `baseUrl` is set by the tsconfig of the `tsconfig-base` package.
  expect(local).toBe('local')
})

it('should look into the other module directories next to the package map', () => {
  expect(dep).toBe('dep')
})
