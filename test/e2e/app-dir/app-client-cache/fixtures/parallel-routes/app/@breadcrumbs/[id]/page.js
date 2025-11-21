export default async function Page(props) {
  const params = await props.params
  return (
    <div>
      Catchall <pre>{JSON.stringify(params)}</pre>{' '}
    </div>
  )
}
