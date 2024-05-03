export const revalidate = 1

export default function UnexpectedErrorPage(props) {
  // use query param to only throw error during runtime, not build time
  if (props.searchParams.error) {
    throw new Error('Oh no')
  }
  return <p id="page">/unexpected-error</p>
}
