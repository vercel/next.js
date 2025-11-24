type AnySearchParams = { [key: string]: string | Array<string> | undefined }

export const revalidate = 1

export default async function UnexpectedErrorPage(props: {
  searchParams: Promise<AnySearchParams>
}) {
  // use query param to only throw error during runtime, not build time
  if ((await props.searchParams).error) {
    throw new Error('Oh no')
  }
  return <p id="page">/unexpected-error</p>
}
