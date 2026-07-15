const title = 'static'

export function Page({ items }) {
  const rows = items.map((title) => <h2 className="row">{title}</h2>)
  return (
    <article>
      <h1>{title}</h1>
      {rows}
    </article>
  )
}
