import { selectInvoices } from './database'

export const invoiceStatuses = ['open', 'paid'] as const

export async function listInvoices() {
  const rows = await selectInvoices()
  return rows.map(({ number, amountCents, status }) => ({
    number,
    amountCents,
    status,
  }))
}
