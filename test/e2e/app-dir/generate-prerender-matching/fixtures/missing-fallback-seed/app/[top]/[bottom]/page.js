export const unstable_matcher = {
  top: 'blocking',
  bottom: 'fallback',
}

export default async function Page({ params }) {
  const { top, bottom } = await params
  return <p>{`${top}/${bottom}`}</p>
}
