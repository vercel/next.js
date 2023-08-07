'use client'

import { useTestHarness } from '@turbo/pack-test-harness'

export default function Test({ action }) {
  useTestHarness(() => {
    it('should run', () => {})
    it('should throw an error when importing server action in client component', async () => {
      await expect(import('./action')).rejects.toMatchObject({
        message:
          /Server actions \("use server"\) are not yet supported in Turbopack/,
      })
    })
    it('should throw an error when importing server action in server component', () => {
      expect(action).toMatch(
        /Server actions \("use server"\) are not yet supported in Turbopack/
      )
    })
  })
}
