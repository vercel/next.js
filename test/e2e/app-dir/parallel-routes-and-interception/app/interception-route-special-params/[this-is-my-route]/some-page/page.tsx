export default function Page({ params }) {
  return (
    <div>
      Hello from [this-is-my-route]/some-page. Param:{' '}
      {params['this-is-my-route']}
    </div>
  )
}
