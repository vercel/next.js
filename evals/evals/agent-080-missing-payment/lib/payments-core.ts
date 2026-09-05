// lib/payments-core.ts — the integrations team's payment-provider client.
// DO NOT MODIFY THIS FILE. It mirrors the provider's real end-to-end capture
// latency (measured from production traces) and appends one NDJSON audit line
// to data/payments-log.ndjson at the start and end of every capture so the
// integrations team can reconcile our records against the provider's own logs.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface PaymentRecord {
  id: string
  invoiceId: string
  amount: number
  capturedAt: number
}

const DATA_DIR = join(process.cwd(), 'data')
const PAYMENTS_FILE = join(DATA_DIR, 'payments.json')
const LOG_FILE = join(DATA_DIR, 'payments-log.ndjson')

function audit(phase: 'start' | 'end', invoiceId: string, amount: number) {
  appendFileSync(
    LOG_FILE,
    JSON.stringify({ phase, ts: Date.now(), invoiceId, amount }) + '\n'
  )
}

function providerLatency() {
  // Capturing a payment with the provider takes about 1.5 seconds end to end.
  return new Promise((resolve) => setTimeout(resolve, 1500))
}

export function readPayments(): PaymentRecord[] {
  const raw = readFileSync(PAYMENTS_FILE, 'utf8')
  return (JSON.parse(raw) as { payments: PaymentRecord[] }).payments
}

export async function capturePayment(
  invoiceId: string,
  amount: number
): Promise<PaymentRecord> {
  audit('start', invoiceId, amount)
  await providerLatency()
  const payment: PaymentRecord = {
    id: 'pay_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    invoiceId,
    amount,
    capturedAt: Date.now(),
  }
  const payments = readPayments()
  payments.push(payment)
  writeFileSync(PAYMENTS_FILE, JSON.stringify({ payments }, null, 2) + '\n')
  audit('end', invoiceId, amount)
  return payment
}
