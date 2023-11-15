'use client'

import { useFormStatus } from 'react-dom'
import { saveData } from './action'
import { useRef } from 'react'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      disabled={pending}
      className="border rounded py-2 px-4 bg-indigo-500 text-white mt-8"
    >
      {pending ? 'Submitting' : 'Submit'}
    </button>
  )
}

export default function UploadForm() {
  const formRef = useRef<HTMLFormElement | null>(null)

  async function formAction(formData: FormData) {
    await saveData(formData)
    formRef.current?.reset()
    alert('Save success!')
  }

  return (
    <form action={formAction} ref={formRef} className="p-8">
      <h1 className="text-2xl font-bold mb-4">Upload Demo</h1>

      <div>Email</div>
      <input
        type="email"
        name="email"
        required
        className="border py-2 px-2 min-w-full rounded mb-4"
      />

      <div>Select file</div>
      <input type="file" name="file" required />
      <br />
      <Submit />
    </form>
  )
}
