'use client'

if (typeof window === 'undefined') {
  require('./page.css')
  console.log(require('./page.module.css'))
}

export default function Page() {
  return <h1>My Page</h1>
}
