'use client'

import { useActionState } from 'react'
import { recordPayment, type RecordPaymentResult } from '../../actions'

const initialState: RecordPaymentResult = { status: 'idle' }

export function RecordPaymentForm({ invoiceId }: { invoiceId: string }) {
  const [result, formAction, isPending] = useActionState(
    recordPayment,
    initialState
  )
  return (
    <form action={formAction} data-testid="record-payment-form">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <label>
        Amount{' '}
        <input
          name="amount"
          data-testid="amount-input"
          inputMode="decimal"
          autoComplete="off"
          required
        />
      </label>{' '}
      <button type="submit" data-testid="save-button">
        {isPending ? 'Saving…' : 'Save'}
      </button>{' '}
      <span data-testid="save-status" role="status">
        {isPending
          ? 'Posting to payment provider…'
          : result.status === 'saved'
            ? `Saved $${result.amount?.toFixed(2)}`
            : ''}
      </span>
    </form>
  )
}
