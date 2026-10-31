export async function unstable_generateParamMatching() {
  return { slug: 'fallback' } as const
}

export default function Page() {
  return <p>Generated matching</p>
}
