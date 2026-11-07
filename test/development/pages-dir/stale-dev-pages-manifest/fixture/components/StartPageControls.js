import Link from 'next/link'

export default function StartPageControls() {
  const materializeHandler = async () => {
    const response = await fetch('/api/materialize-handler', { method: 'POST' })

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`)
    }
  }

  return (
    <div>
      <button
        id="materialize-example"
        type="button"
        onClick={materializeHandler}
      >
        Materialize example
      </button>
      <Link href="/docs/example" prefetch={false} id="go-to-example">
        Go to example
      </Link>
    </div>
  )
}
