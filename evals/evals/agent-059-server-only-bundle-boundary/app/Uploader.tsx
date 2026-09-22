'use client'

import { useState } from 'react'
import { attachmentTypeSchema } from '@/lib/chat-db/schema'

export function Uploader() {
  const [message, setMessage] = useState('Choose an attachment type')

  return (
    <section>
      <label htmlFor="attachment-type">Attachment type</label>
      <select
        id="attachment-type"
        onChange={(event) => {
          const result = attachmentTypeSchema.safeParse(event.target.value)
          setMessage(result.success ? `Ready: ${result.data}` : result.error)
        }}
      >
        <option value="">Select a type</option>
        <option value="image">Image</option>
        <option value="text">Text</option>
        <option value="file">File</option>
        <option value="executable">Executable</option>
      </select>
      <p>{message}</p>
    </section>
  )
}
