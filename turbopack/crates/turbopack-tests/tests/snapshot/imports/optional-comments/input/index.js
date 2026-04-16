// turbopackOptional should suppress resolve errors silently
import(/* turbopackOptional: true */ './missing.mjs').then(
  (m) => console.log(m),
  (e) => console.log('missing.mjs not found')
)

// require with turbopackOptional should also work
try {
  const missing = require(/* turbopackOptional: true */ './missing.cjs')
  console.log(missing)
} catch (e) {
  console.log('missing.cjs not found')
}

// webpackOptional is NOT supported, so this should NOT suppress the error
import(/* webpackOptional: true */ './missing-should-error-webpack.mjs')

// turbopackOptional: false should still produce errors
import(
  /* turbopackOptional: false */ './missing-should-error-optional-false.mjs'
)

// Default behavior without any optional comment should produce errors
import('./missing-should-error-default.mjs')

// Test with existing module - should work normally
import('./existing.mjs').then((m) => console.log(m))
require('./existing.cjs')
