type InvoiceRow = {
  number: string
  amountCents: number
  status: 'open' | 'paid'
  reconciliationAccount: string
}

// Stand-in for the billing database adapter. Keep access behind this module.
const invoiceRows: InvoiceRow[] = [
  {
    number: 'INV-101',
    amountCents: 12500,
    status: 'open',
    reconciliationAccount: 'ledger-a',
  },
  {
    number: 'INV-102',
    amountCents: 8000,
    status: 'paid',
    reconciliationAccount: 'ledger-b',
  },
  {
    number: 'INV-103',
    amountCents: 32000,
    status: 'open',
    reconciliationAccount: 'ledger-c',
  },
]

export async function selectInvoices() {
  return invoiceRows.map((invoice) => ({ ...invoice }))
}
