export function LatestInvoices({
  invoices,
}: {
  invoices: { id: string; name: string; amount: number }[]
}) {
  return (
    <div className="invoices">
      <h2>Latest Invoices</h2>
      <ul>
        {invoices.map((invoice) => (
          <li key={invoice.id}>
            {invoice.name} - ${invoice.amount.toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  )
}
