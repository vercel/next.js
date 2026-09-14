export function RevenueChart({
  revenue,
}: {
  revenue: { month: string; amount: number }[]
}) {
  return (
    <div className="chart">
      <h2>Revenue</h2>
      <ul>
        {revenue.map((item) => (
          <li key={item.month}>
            {item.month}: ${item.amount.toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  )
}
