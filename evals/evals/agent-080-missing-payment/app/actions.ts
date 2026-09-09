'use server'

import { capturePayment } from '../lib/payments-core'

export type RecordPaymentResult = {
  status: 'idle' | 'saved'
  amount?: number
}

export async function recordPayment(
  _prev: RecordPaymentResult,
  formData: FormData
): Promise<RecordPaymentResult> {
  const invoiceId = String(formData.get('invoiceId') ?? '')
  const amount = Number(formData.get('amount') ?? 0)
  const payment = await capturePayment(invoiceId, amount)
  // The payments page reads the payments file fresh on every request, so
  // there's nothing to invalidate here.
  return { status: 'saved', amount: payment.amount }
}
