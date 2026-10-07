'use client'

export default function Page() {
  const goInvalidUrl = () => {
    const { protocol, hostname, port } = location

    location.href = `${protocol}//${hostname}${port ? ':' + port : ''}//`
  }

  return (
    <>
      <h1>index page</h1>
      <p>
        <button type="button" onClick={goInvalidUrl}>
          Go invalid URL
        </button>
      </p>
    </>
  )
}
