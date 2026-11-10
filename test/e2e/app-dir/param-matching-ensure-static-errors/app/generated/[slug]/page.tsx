export async function unstable_generateParamMatching() {
  return { slug: 'fallback' }
}

export function generateStaticParams() {
  return [{ slug: 'seed' }]
}

export default function Page() {
  return <p>Static content</p>
}
