export default function Page({ params }) {
  return (
    <div>
      Catchall <pre>{JSON.stringify(params)}</pre>{' '}
    </div>
  )
}
