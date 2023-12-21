'use client'

import { useRouter } from 'next/navigation'

interface ModalProps {
  title: string
  context: string
}

export function Modal({ title, context }: ModalProps) {
  const router = useRouter()

  return (
    <div>
      <div className="modal">
        <h1>{title}</h1>
        <h2>{context}</h2>
      </div>
      <div
        className="modal-overlay"
        onClick={() => {
          router.back()
        }}
      />
    </div>
  )
}
