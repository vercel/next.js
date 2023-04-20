'use client'

import { useEffect } from 'react'

export default function Test() {
  useEffect(() => {
    import('@turbo/pack-test-harness').then(() => {
      it('should make a GET request', async () => {
        const res = await fetch('/world')
        const text = await res.text()
        expect(text).toEqual('hello world')
        expect(res.headers.get('method')).toEqual('GET')
      }, 20000)
      it('should make a POST request', async () => {
        const res = await fetch('/route.js', {
          method: 'POST',
        })
        const text = await res.text()
        expect(text).toEqual('hello route.js')
        expect(res.headers.get('method')).toEqual('POST')
      }, 20000)
    })
    return () => {}
  }, [])
}
