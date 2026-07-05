'use client'

if (Math.random() < 0) {
  require('a-missing-module-for-error-testing')
}

export default function Page() {
  return <p>error page</p>
}
