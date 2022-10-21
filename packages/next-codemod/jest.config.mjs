import nextJest from 'next/jest.js'

export default nextJest()({
  testMatch: ['<rootDir>/test.js'],
  verbose: true,
})
