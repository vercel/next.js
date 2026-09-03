export function generateStaticParams() {
  return [{ 'this-is-my-route': 'some-random-param' }]
}

export default async function Page({ params }) {
  return (
    <div>
      Hello from [this-is-my-route]/some-page. Param:{' '}
      {(await params)['this-is-my-route']}
    </div>
  )
}
