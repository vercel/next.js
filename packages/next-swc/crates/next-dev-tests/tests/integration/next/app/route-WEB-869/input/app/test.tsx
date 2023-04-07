'use client'

import { useEffect } from 'react'

export default function Test() {
  useEffect(() => {
    import('@turbo/pack-test-harness').then(() => {
      it('includes ENV vars in route edge runner', async () => {
        const res = await fetch('/route')
        const json = await res.json()
        expect(json).toMatchObject({
          FOOBAR: 'foobar',
        })
      }, 20000)
    })
    return () => {}
  }, [])
}
