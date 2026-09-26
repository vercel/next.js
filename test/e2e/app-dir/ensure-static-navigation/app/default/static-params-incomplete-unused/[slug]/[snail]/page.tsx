export async function generateStaticParams() {
  return [{ slug: '123' }]
}

export const unstable_ensureStatic = 'navigation'

type Params = { slug: string; snail: string }

export default function Page(_props: { params: Promise<Params> }) {
  return (
    <main>
      <p>This page has a param that's not in gSP, but does not use it</p>
    </main>
  )
}
