import { HydrationStatus, SlowHydration } from './slow-hydration'

export default function Page() {
  return (
    <>
      <p id="server-text">before</p>
      <HydrationStatus />
      <SlowHydration />
    </>
  )
}
