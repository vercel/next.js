import React from 'react'

export const dynamic = 'force-dynamic'

const ROWS = 1000

function Row({ index }) {
  return (
    <div
      className={`row item-${index}`}
      id={`row-${index}`}
      data-index={index}
      aria-label={`Row ${index}`}
      title={`Item number ${index}`}
      style={{
        color: 'red',
        padding: 4,
        margin: 2,
        fontWeight: 600,
      }}
    >
      Item content {index}
    </div>
  )
}

export default function Page() {
  const rows = []
  for (let index = 0; index < ROWS; index++) {
    rows.push(<Row key={index} index={index} />)
  }

  return <main className="container">{rows}</main>
}
