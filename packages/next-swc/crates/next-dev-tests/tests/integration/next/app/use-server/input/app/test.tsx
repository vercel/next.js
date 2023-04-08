'use client'

import { useEffect } from 'react'

export default function Test({ action }) {
  useEffect(() => {
    import('@turbo/pack-test-harness').then(() => {
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
    return () => {}
  }, [action])
}
