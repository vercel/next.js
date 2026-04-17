export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ cookies: [] }],
  unstable_disableValidation: true,
}
export const unstable_prefetch = 'force-runtime'

export default function Layout({ children }) {
  return <>{children}</>
}
