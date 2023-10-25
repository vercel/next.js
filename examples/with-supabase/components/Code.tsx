'use client'

import { useState } from 'react'

const CopyIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
)

const CheckIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
)

export default function Code({ code }: { code: string }) {
  const [icon, setIcon] = useState(CopyIcon)

  const copy = async () => {
    await navigator?.clipboard?.writeText(code)
    setIcon(CheckIcon)
    setTimeout(() => setIcon(CopyIcon), 2000)
  }

  return (
    <pre className="bg-foreground/5 rounded-md p-8 my-8 relative">
      <button
        onClick={copy}
        className="absolute top-4 right-4  p-2 rounded-md bg-foreground/5 hover:bg-foreground/10"
      >
        {icon}
      </button>
      <code>{code}</code>
    </pre>
  )
}
