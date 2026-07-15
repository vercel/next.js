const el = <div className="static" />

export function Page() {
  const inner = () => <p>deep</p>
  return (
    <section>
      {el}
      {inner()}
    </section>
  )
}
