/**
 * @jest-environment jsdom
 */
/* eslint-disable @next/internal/typechecked-require -- Not a prod file */
/* eslint-disable import/no-extraneous-dependencies -- Not a prod file */

import type * as WebVitals from './web-vitals'

jest.mock('next/dist/compiled/web-vitals', () => ({
  onCLS: jest.fn(),
  onFCP: jest.fn(),
  onINP: jest.fn(),
  onLCP: jest.fn(),
  onTTFB: jest.fn(),
}))

type WebVitalsMocks = Record<
  'onCLS' | 'onFCP' | 'onINP' | 'onLCP' | 'onTTFB',
  jest.Mock
>

describe('useReportWebVitals', () => {
  let cleanup: typeof import('@testing-library/react').cleanup
  let renderHook: typeof import('@testing-library/react').renderHook
  let useReportWebVitals: typeof WebVitals.useReportWebVitals
  let webVitals: WebVitalsMocks

  beforeEach(() => {
    jest.resetModules()

    useReportWebVitals = (require('./web-vitals') as typeof WebVitals)
      .useReportWebVitals
    webVitals = require('next/dist/compiled/web-vitals') as WebVitalsMocks
    const rtl = require('@testing-library/react/pure')
    renderHook = rtl.renderHook
    cleanup = rtl.cleanup
  })

  afterEach(() => {
    cleanup()
  })

  it('reports the Core Web Vitals for soft navigations', () => {
    const report = jest.fn()
    renderHook(() => useReportWebVitals(report))

    for (const onCoreWebVital of [
      webVitals.onCLS,
      webVitals.onINP,
      webVitals.onLCP,
    ]) {
      expect(onCoreWebVital).toHaveBeenCalledTimes(1)
      expect(onCoreWebVital).toHaveBeenCalledWith(report, {
        reportSoftNavs: true,
      })
    }
  })

  it('reports FCP and TTFB for the initial page load only', () => {
    const report = jest.fn()
    renderHook(() => useReportWebVitals(report))

    for (const onLoadMetric of [webVitals.onFCP, webVitals.onTTFB]) {
      expect(onLoadMetric).toHaveBeenCalledTimes(1)
      expect(onLoadMetric).toHaveBeenCalledWith(report)
    }
  })

  it('does not register the same callback twice on re-render', () => {
    const report = jest.fn()
    const { rerender } = renderHook(() => useReportWebVitals(report))

    rerender()

    expect(webVitals.onLCP).toHaveBeenCalledTimes(1)
  })
})
