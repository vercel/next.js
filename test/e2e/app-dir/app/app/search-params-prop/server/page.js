export default function Page({ searchParams }) {
  return (
    <h1
      id="params"
      data-param-first={searchParams.first ?? 'N/A'}
      data-param-second={searchParams.second ?? 'N/A'}
      data-param-third={searchParams.third ?? 'N/A'}
      data-param-not-real={searchParams.notReal ?? 'N/A'}
    >
      hello from searchParams prop server
    </h1>
  )
}
