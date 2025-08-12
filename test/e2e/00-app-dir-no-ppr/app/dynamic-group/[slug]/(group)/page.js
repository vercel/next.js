export default function Page({ params }) {
  return (
    <>
      <p>
        Catch All Page. Params:{' '}
        <span id="catch-all-page-params">{JSON.stringify(params)}</span>
      </p>
    </>
  )
}
