// @other has config at the same depth as children's page.
// Children's config should be preferred for the root cause
// because children wins at equal depth.
export const unstable_instant = { prefetch: 'static' }

export default function OtherPage() {
  return <p>Other slot page — same-depth config, no blocking</p>
}
