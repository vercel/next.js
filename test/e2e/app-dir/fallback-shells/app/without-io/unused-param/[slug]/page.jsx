import { HydrationMarker } from '../../../../components/hydration-marker'

export function generateStaticParams() {
  return [{ slug: 'foo' }]
}

export default function Page() {
  return <HydrationMarker />
}
