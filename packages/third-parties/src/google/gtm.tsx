'use client'
// TODO: Evaluate import 'client only'
import React from 'react'
import Script from 'next/script'

declare global {
  interface Window {
    dataLayer?: Object[]
    [key: string]: any
  }
}

type GTMParams = {
  gtmId: string
  dataLayer: string[]
  dataLayerName: string
  auth: string
  preview: string
}

let currDataLayerName: string | undefined = undefined

export function GoogleTagManager(props: GTMParams) {
  const { gtmId, dataLayerName = 'dataLayer', auth, preview, dataLayer } = props

  if (currDataLayerName === undefined) {
    currDataLayerName = dataLayerName
  }

  const gtmLayer = dataLayerName !== 'dataLayer' ? `$l=${dataLayerName}` : ''
  const gtmAuth = auth ? `&gtm_auth=${auth}` : ''
  const gtmPreview = preview ? `&gtm_preview=${preview}&gtm_cookies_win=x` : ''

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
      />
      <Script
        id="_next-gtm"
        src={`https://www.googletagmanager.com/gtm.js?id=${gtmId}${gtmLayer}${gtmAuth}${gtmPreview}`}
      />
    </>
  )
}

export const sendGTMEvent = (data: Object) => {
  if (currDataLayerName === undefined) {
    console.warn(`@next/third-parties: GTM has not been initialized`)
    return
  }

  if (window[currDataLayerName]) {
    window[currDataLayerName].push(data)
  } else {
    console.warn(
      `@next/third-parties: GTM dataLayer ${currDataLayerName} does not exist`
    )
  }
}
