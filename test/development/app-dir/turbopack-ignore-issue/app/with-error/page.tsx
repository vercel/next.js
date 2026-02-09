'use client'

const missing = require('a-missing-module-for-error-testing')

export default function Page() {
  return <p>error page {String(missing)}</p>
}
