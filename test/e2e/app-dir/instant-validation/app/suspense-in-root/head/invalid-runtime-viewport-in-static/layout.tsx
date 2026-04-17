export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ cookies: [] }],
}
export const unstable_prefetch = 'force-runtime'

export default async function Layout({ children }) {
  return <>{children}</>
}
