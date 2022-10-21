import nextJest from 'next/jest.js'

export default nextJest()({
  testMatch: ['**/*.test.js', '**/*.test.ts', '**/*.test.tsx'],
  verbose: true,
})
