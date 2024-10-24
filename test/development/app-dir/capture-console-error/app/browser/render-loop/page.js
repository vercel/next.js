'use client'

export default function Page() {
  for (let i = 0; i < 3; i++) {
    console.error('trigger an console.error in loop of render')
  }
  return <p>render</p>
}
