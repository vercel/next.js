// we don't want to try and prerender this page or it'll fail the build
export const dynamic = 'force-dynamic'

export default function Page() {
  throw new Error('Trigger error boundary')
}
