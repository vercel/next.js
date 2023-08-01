'use client'

import { useTestHarness } from '@turbo/pack-test-harness'

export default function Test() {
  useTestHarness(() => {
    it('includes ENV vars in route edge runner', async () => {
      const res = await fetch('/route')
      const json = await res.json()
      expect(json).toMatchObject({
        FOOBAR: 'foobar',
      })
    }, 20000)
  })
}
