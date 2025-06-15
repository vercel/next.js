'use client'

import { useEffect } from 'react'
import Script from 'next/script'

import type { FBPixelProps } from '../types/meta'

export const FacebookPixel = (props: FBPixelProps) => {
  const {
    pixelId,
    pixelScriptUrl = 'https://connect.facebook.net/en_US/fbevents.js',
  } = props

  useEffect(() => {
    // performance.mark is being used as a feature use signal. While it is traditionally used for performance
    // benchmarking it is low overhead and thus considered safe to use in production and it is a widely available
    // existing API.
    // The performance measurement will be handled by Chrome Aurora

    performance.mark('mark_feature_usage', {
      detail: {
        feature: 'next-third-parties-fb-pixel',
      },
    })
  }, [])

  return (
    <>
      <Script
        id="_next-fb-pixel"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
		  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  '${pixelScriptUrl}');
  fbq('init', '${pixelId}');
  fbq('track', 'PageView');
	`,
        }}
      />
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  )
}

// https://developers.facebook.com/docs/facebook-pixel/advanced/
export const pageView = () => {
  window?.fbq('track', 'PageView')
}

export const trackPixelEvent = (name: string, options: any = {}) => {
  window?.fbq('track', name, options)
}
