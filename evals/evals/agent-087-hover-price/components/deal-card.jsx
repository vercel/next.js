import Link from 'next/link'

export function DealCard({ deal }) {
  return (
    <Link
      href={`/deal/${deal.id}`}
      data-testid={`deal-card-${deal.id}`}
      style={{
        display: 'inline-block',
        width: 130,
        padding: '4px 6px',
        margin: 2,
        fontSize: 11,
        border: '1px solid #ccc',
        borderRadius: 4,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      {deal.title}
    </Link>
  )
}
