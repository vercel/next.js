'use client'
// TODO: Evaluate import 'client only'
import React, { useEffect } from 'react'
import Script from 'next/script'

import type { GTMParams } from '../types/google'

let currDataLayerName = 'dataLayer'

export function GoogleTagManager(props: GTMParams) {
  const {
    gtmId,
    gtmScriptUrl = 'https://www.googletagmanager.com/gtm.js',
    dataLayerName = 'dataLayer',
    auth,
    preview,
    dataLayer,
    nonce,
  } = props

  currDataLayerName = dataLayerName

  const gtmLayer = dataLayerName !== 'dataLayer' ? `&l=${dataLayerName}` : ''
  const gtmAuth = auth ? `&gtm_auth=${auth}` : ''
  const gtmPreview = preview ? `&gtm_preview=${preview}&gtm_cookies_win=x` : ''

  useEffect(() => {
    // performance.mark is being used as a feature use signal. While it is traditionally used for performance
    // benchmarking it is low overhead and thus considered safe to use in production and it is a widely available
    // existing API.
    // The performance measurement will be handled by Chrome Aurora

    performance.mark('mark_feature_usage', {
      detail: {
        feature: 'next-third-parties-gtm',
      },
    })
  }, [])

  return (
    <>
      <Script
        id="_next-gtm-init"
        dangerouslySetInnerHTML={{
          __html: `
      (function(w,l){
        w[l]=w[l]||[];
        w[l].push({'gtm.start': new Date().getTime(),event:'gtm.js'});
        ${dataLayer ? `w[l].push(${JSON.stringify(dataLayer)})` : ''}
      })(window,'${dataLayerName}');`,
        }}
        nonce={nonce}
      />
      <Script
        id="_next-gtm"
        data-ntpc="GTM"
        src={`${gtmScriptUrl}?id=${gtmId}${gtmLayer}${gtmAuth}${gtmPreview}`}
        nonce={nonce}
      />
    </>
  )
}

export const sendGTMEvent = (data: Object, dataLayerName?: string) => {
  // special case if we are sending events before GTM init and we have custom dataLayerName
  const dataLayer = dataLayerName || currDataLayerName
  // define dataLayer so we can still queue up events before GTM init
  window[dataLayer] = window[dataLayer] || []
  window[dataLayer].push(data)
}
