export async function Transactions() {
  const res = await fetch('https://api.example.com/transactions')
  const transactions = await res.json()
  return <ul>{transactions.length}</ul>
}
