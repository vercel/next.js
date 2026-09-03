'use cache'

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function Page(props: Props) {
  // Forwarding the page props to a child Server Component must not be treated
  // as a `searchParams` access.
  return <Inner {...props} />
}

async function Inner(props: Props) {
  return (
    <p>
      Page: <span id="page-date">{new Date().toISOString()}</span>
    </p>
  )
}
