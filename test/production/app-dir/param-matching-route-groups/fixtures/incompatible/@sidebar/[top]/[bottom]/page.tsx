// Valid on its own, but the main slot explicitly configures top as fallback.
export const unstable_paramMatching = { bottom: 'blocking' } as const

export default function Page() {
  return <p>Sidebar page</p>
}
