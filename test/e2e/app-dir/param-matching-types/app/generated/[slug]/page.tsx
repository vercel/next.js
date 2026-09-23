export async function unstable_generateParamMatching() {
  return { slug: 'fallback' }
}

export function generateStaticParams() {
  return [{ slug: 'one' }]
}

export default function Page() {
  return <p>Generated matching export</p>
}
