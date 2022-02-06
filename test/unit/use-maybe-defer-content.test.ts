/* eslint-env jest */
import { useMaybeDeferContent } from 'next/dist/server/render'
import React from 'react'

describe('useMaybeDeferContent', () => {
  it('returns raw content when isDeferred is false', () => {
    const rawContent = React.createElement('p', {}, 'hello world')
    const [isDeferred, content] = useMaybeDeferContent('TEST', () => rawContent)
    expect(isDeferred).toBe(false)
    expect(content).toBe(rawContent)
  })
})
