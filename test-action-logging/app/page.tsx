'use client'

import { useState } from 'react'
import { greet, addNumbers, submitForm } from './actions'

export default function Page() {
  const [result, setResult] = useState<string>('')

  async function handleGreet() {
    const greeting = await greet('World')
    setResult(greeting)
  }

  async function handleAdd() {
    const sum = await addNumbers(5, 3)
    setResult(`Sum: ${sum}`)
  }

  async function handleSubmit(formData: FormData) {
    const response = await submitForm(formData)
    setResult(JSON.stringify(response))
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Server Action Logging Test</h1>

      <div style={{ marginBottom: 20 }}>
        <button onClick={handleGreet}>Test greet("World")</button>
      </div>

      <div style={{ marginBottom: 20 }}>
        <button onClick={handleAdd}>Test addNumbers(5, 3)</button>
      </div>

      <form action={handleSubmit} style={{ marginBottom: 20 }}>
        <input name="name" placeholder="Name" defaultValue="John" />
        <input
          name="email"
          placeholder="Email"
          defaultValue="john@example.com"
        />
        <button type="submit">Test submitForm</button>
      </form>

      {result && (
        <div style={{ padding: 10, background: '#f0f0f0' }}>
          Result: {result}
        </div>
      )}
    </div>
  )
}
