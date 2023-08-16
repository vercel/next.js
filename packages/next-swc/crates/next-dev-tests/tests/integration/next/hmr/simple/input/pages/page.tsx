import { useTestHarness } from '@turbo/pack-test-harness'

export default function Page() {
  useTestHarness((harness) => harness.markAsHydrated())

  return (
    <>
      Hello <span id="replacement">World</span>
    </>
  )
}
