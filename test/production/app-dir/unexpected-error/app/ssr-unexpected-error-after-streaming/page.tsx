import { use } from 'react'

type AnySearchParams = { [key: string]: string | Array<string> | undefined }

export default function UnexpectedErrorPage(props: {
  searchParams: Promise<AnySearchParams>
}) {
  // use query param to only throw error during runtime, not build time
  if (use(props.searchParams).error) {
    throw new Error('Oh no')
  }
  return <p id="page">/unexpected-error</p>
}
