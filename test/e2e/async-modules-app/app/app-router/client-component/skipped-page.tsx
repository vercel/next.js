'use client'
const appValue = await Promise.resolve('hello')

export default function Page() {
  return <p id="app-router-client-component-value">{appValue}</p>
}
