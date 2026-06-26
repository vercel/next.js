export function CardStats({
  totalRevenue,
  totalInvoices,
}: {
  totalRevenue: number
  totalInvoices: number
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="card">
        <h2>Total Revenue</h2>
        <p>${totalRevenue.toLocaleString()}</p>
      </div>
      <div className="card">
        <h2>Total Invoices</h2>
        <p>{totalInvoices}</p>
      </div>
    </div>
  )
}
