'use client'

async function fetchMore() {
  const res = await Promise.resolve('more data')
  return res
}

export default function Page() {
  return (
    <div>
      <button onClick={() => fetchMore().then(console.log)}>Client</button>
    </div>
  )
}
