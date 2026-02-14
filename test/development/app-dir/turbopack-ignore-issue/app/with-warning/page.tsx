'use client'

export default function Page() {
  let missing = null
  try {
    missing = require('a-missing-module-for-testing')
  } catch (e) {
    // expected
  }
  return <p>warning page {String(missing)}</p>
}
