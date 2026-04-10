'use client'

import { useParams } from 'next/navigation'

export default function InboxModalClient() {
  const params = useParams()

  return <p id="modal-thread">Modal {params.thread}</p>
}
