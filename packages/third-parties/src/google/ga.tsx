'use client'
// TODO: Evaluate import 'client only'
import React, { useEffect } from 'react'
import Script from 'next/script'

import type { GAParams } from '../types/google'

declare global {
  interface Window {
    dataLayer?: Object[]
  }
}

let currDataLayerName: string | undefined = undefined

export function GoogleAnalytics(props: GAParams) {
  const { gaId, dataLayerName = 'dataLayer' } = props

  if (currDataLayerName === undefined) {
    currDataLayerName = dataLayerName
  }

  useEffect(() => {
    // performance.mark is being used as a feature use signal. While it is traditionally used for performance
    // benchmarking it is low overhead and thus considered safe to use in production and it is a widely available
    // existing API.
    // The performance measurement will be handled by Chrome Aurora

    performance.mark('mark_feature_usage', {
      detail: {
        feature: 'next-third-parties-ga',
      },
    })
  }, [])

  return (
    <>
      <Script
        id="_next-ga-init"
        dangerouslySetInnerHTML={{
          __html: `
          window['${dataLayerName}'] = window['${dataLayerName}'] || [];
          function gtag(){window['${dataLayerName}'].push(arguments);}
          gtag('js', new Date());

          gtag('config', '${gaId}');`,
        }}
      />
      <Script
        id="_next-ga"
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
      />
    </>
  )
}

export const sendGAEvent = (...args: Object[]) => {
  if (currDataLayerName === undefined) {
    console.warn(`@next/third-parties: GA has not been initialized`)
    return
  }

  if (window[currDataLayerName]) {
    window[currDataLayerName].push(...args)
  } else {
    console.warn(
      `@next/third-parties: GA dataLayer ${currDataLayerName} does not exist`
    )
  }
}
