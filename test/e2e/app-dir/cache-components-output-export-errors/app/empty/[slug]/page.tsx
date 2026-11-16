export function generateStaticParams() {
  return []
}

export default function Page() {
  return <p>No generated parameters</p>
}

export const unstable_paramMatching = { slug: 'not-found' } as const
