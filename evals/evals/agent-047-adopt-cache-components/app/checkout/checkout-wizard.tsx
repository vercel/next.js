'use client'

import Link from 'next/link'
import { useState } from 'react'

export function CheckoutWizard() {
  const [step, setStep] = useState(1)

  return (
    <section>
      <p>Step {step} of 2</p>
      {step === 1 ? (
        <button onClick={() => setStep(2)}>Continue to review</button>
      ) : (
        <p>Review your order before submitting.</p>
      )}
      <p>
        <Link href="/">Continue shopping</Link>
      </p>
    </section>
  )
}
