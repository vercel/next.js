export default async function Page({ params }) {
  const { buzz = [] } = await params
  return (
    <div>
      <h2>/fizz/[...buzz] Page!</h2>
      <h3>buzz[0]: {buzz[0]}</h3>
      <h4>buzz[1]: {buzz[1]}</h4>
    </div>
  )
}
