import { EmitRequestInsightsSnapshot } from './snapshot-button'

export const instant = { level: 'experimental-error' }

export default function Page() {
  return (
    <>
      <p>instant insights</p>
      <EmitRequestInsightsSnapshot />
    </>
  )
}
