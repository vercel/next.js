'use client'

export const runtime = 'edge'

function functionA() {
  throw new Error('Deep stack error during render')
}

function functionB() {
  functionA()
}

function functionC() {
  functionB()
}

export default function EdgeDeepStackPage() {
  functionC()

  return <div></div>
}
