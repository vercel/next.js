export const unstable_paramMatching = {
  top: 'blocking',
  bottom: 'fallback',
}

export function generateStaticParams() {
  return [{ top: 't1', bottom: 'b1' }]
}

export default async function Page({ params }) {
  const { top, bottom } = await params
  return <p>{`${top}/${bottom}`}</p>
}
