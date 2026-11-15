'use client'

import { useState } from 'react'

const STEPS = [
  'Search the documentation from the box below. Results update as you type, and you can press Enter to open the first match in a new tab.',
  'Still stuck? Start a conversation with our support assistant. It can look up your recent orders and walk you through common fixes step by step.',
  'Need a human? Open a ticket from the Support page and include as much detail as you can. Our team usually replies within one business day.',
]

export function WelcomeTour() {
  const [step, setStep] = useState(0)
  const docsUrl = process.env.NEXT_PUBLIC_DOCS_URL ?? 'https://docs.acme.test'

  return (
    <section aria-label="Getting started">
      <p>{STEPS[step]}</p>
      <button
        type="button"
        onClick={() => setStep((current) => (current + 1) % STEPS.length)}
      >
        Next tip
      </button>{' '}
      <a href={docsUrl}>Browse all docs</a>
    </section>
  )
}
