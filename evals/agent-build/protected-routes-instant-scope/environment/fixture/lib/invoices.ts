import { cacheLife, cacheTag } from 'next/cache'

export type InvoiceStatus = 'open' | 'paid' | 'overdue'

export type Invoice = {
  id: string
  teamId: string
  customer: string
  amount: number
  status: InvoiceStatus
}

const seed: Invoice[] = [
  {
    id: 'INV-1041',
    teamId: 'analytical-engines',
    customer: 'Babbage & Co',
    amount: 1250,
    status: 'open',
  },
  {
    id: 'INV-1040',
    teamId: 'analytical-engines',
    customer: 'Difference Works',
    amount: 980,
    status: 'paid',
  },
  {
    id: 'INV-1039',
    teamId: 'analytical-engines',
    customer: 'Menabrea Press',
    amount: 410,
    status: 'overdue',
  },
  {
    id: 'INV-1038',
    teamId: 'analytical-engines',
    customer: 'Babbage & Co',
    amount: 1250,
    status: 'paid',
  },
  {
    id: 'INV-2007',
    teamId: 'bletchley',
    customer: 'Hut 8 Supplies',
    amount: 300,
    status: 'open',
  },
  {
    id: 'INV-2006',
    teamId: 'bletchley',
    customer: 'Colossus Ltd',
    amount: 5400,
    status: 'paid',
  },
]

export async function getInvoices(teamId: string): Promise<Invoice[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(`invoices-${teamId}`)

  await new Promise((resolve) => setTimeout(resolve, 20))
  return seed.filter((invoice) => invoice.teamId === teamId)
}

export function summarize(invoices: Invoice[]) {
  return {
    outstanding: invoices
      .filter((invoice) => invoice.status !== 'paid')
      .reduce((total, invoice) => total + invoice.amount, 0),
    overdue: invoices.filter((invoice) => invoice.status === 'overdue').length,
  }
}
