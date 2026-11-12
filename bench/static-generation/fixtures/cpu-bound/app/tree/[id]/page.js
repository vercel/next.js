const PAGES = Number(process.env.BENCH_CPU_PAGES || 600)
const BREADTH = Number(process.env.BENCH_CPU_BREADTH || 12)
const DEPTH = Number(process.env.BENCH_CPU_DEPTH || 3)

export function generateStaticParams() {
  return Array.from({ length: PAGES }, (_, i) => ({ id: String(i) }))
}

function Node({ seed, depth }) {
  const label = `node-${seed}-${depth}`
  if (depth === 0) {
    return (
      <span data-seed={seed} className={label}>
        {label}
      </span>
    )
  }
  return (
    <div className={label}>
      <p>{label}</p>
      {Array.from({ length: BREADTH }, (_, i) => (
        <Node key={i} seed={seed * 31 + i} depth={depth - 1} />
      ))}
    </div>
  )
}

export default async function Page({ params }) {
  const { id } = await params
  return (
    <main>
      <h1>CPU page {id}</h1>
      <Node seed={Number(id)} depth={DEPTH} />
    </main>
  )
}
