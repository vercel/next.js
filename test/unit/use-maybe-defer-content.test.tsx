/* eslint-env jest */
import {
  generateMaybeDeferContentHook,
  replacePlaceholderWithContent,
} from 'next/dist/server/use-maybe-defer-content'
import { DEFERRED_CONTENT_PLACEHOLDER } from 'next/dist/shared/lib/constants'
import React from 'react'

describe('useMaybeDeferContent', () => {
  it('returns raw content when isDeferred is false', () => {
    const useMaybeDeferContent = generateMaybeDeferContentHook(false)

    const rawContent = <p>Hello world</p>
    const content = useMaybeDeferContent(() => rawContent)
    expect(content).toBe(rawContent)
  })

  it('returns a placeholder when isDeferred is true', () => {
    const useMaybeDeferContent = generateMaybeDeferContentHook(true)

    const placeholder = <>{DEFERRED_CONTENT_PLACEHOLDER}</>

    const content = useMaybeDeferContent(() => <p>Hello world</p>)

    expect(content).toEqual(placeholder)
  })

  it('replaces placeholder with deferred content', () => {
    const useMaybeDeferContent = generateMaybeDeferContentHook(true)

    useMaybeDeferContent(() => <p>Hello world</p>)

    const html = `<div>Some text</div>${DEFERRED_CONTENT_PLACEHOLDER}<div>other text</div>`
    const expectedResult = `<div>Some text</div><p>Hello world</p><div>other text</div>`
    expect(replacePlaceholderWithContent(html)).toEqual(expectedResult)
  })
})
