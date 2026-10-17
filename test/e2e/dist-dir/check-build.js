const assert = require('node:assert/strict')
const { existsSync } = require('node:fs')

// Run beside the build output, including inside Vercel's remote build.
assert(existsSync('dist/BUILD_ID'), 'Expected dist/BUILD_ID to exist')
console.log('Found dist/BUILD_ID')

assert(!existsSync('.next'), 'Expected no default .next directory')
console.log('No .next directory')
