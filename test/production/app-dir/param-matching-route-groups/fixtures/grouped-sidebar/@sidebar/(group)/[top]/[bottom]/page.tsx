export async function experimental_generateParamMatching() {
  return { top: 'blocking', bottom: 'fallback' } as const
}

export function generateStaticParams() {
  return [{ top: 't1', bottom: 'b1' }]
}

export default function Page() {
  return <p id="sidebar-page">Sidebar page</p>
}
