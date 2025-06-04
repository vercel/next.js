export default async function Page({ params }) {
  return (
    <div>
      Hello from [this-is-my-route]/@intercept/some-page. Param:{' '}
      {(await params)['this-is-my-route']}
    </div>
  )
}
