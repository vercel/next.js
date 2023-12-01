'use client'
// TODO: Evaluate import 'client only'
import React, { useEffect } from 'react'
import Script from 'next/script'

declare global {
  interface Window {
    dataLayer?: Object[]
  }
}

type GAParams = {
  gaId: string
}

export function GoogleAnalytics(props: GAParams) {
  const { gaId } = props

  useEffect(() => {
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
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
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
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push(...args)
}
