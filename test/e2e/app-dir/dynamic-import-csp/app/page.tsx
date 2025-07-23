import dynamic from 'next/dynamic'

const DynamicButton = dynamic(
  () =>
    import('./dynamic-button').then((mod) => ({ default: mod.DynamicButton })),
  {
    loading: () => <p>Loading...</p>,
  }
)

export default function Home() {
  return (
    <div>
      <h1>Dynamic Import with CSP Test</h1>
      <DynamicButton />
    </div>
  )
}
