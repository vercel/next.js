import Script from 'next/script'
import React from 'react'
import type { MetaPixelProps, MetaPixelStandardEvent } from '../types/meta'

/**
 * Easily add Meta (Facebook) Pixel to your Next.js app.
 *
 * @see https://developers.facebook.com/docs/meta-pixel/
 */
export function MetaPixel({
  pixelId,
  trackEvent = 'PageView',
}: MetaPixelProps) {
  return (
    <>
      <Script id="meta-pixel-init" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${pixelId}');
          fbq('track', '${trackEvent}');
        `}
      </Script>

      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=${trackEvent}&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  )
}

export const sendMetaPixelEvent = (
  eventName: MetaPixelStandardEvent | string,
  params?: Record<string, unknown>
) => {
  if (typeof window === 'undefined') return

  if (!window.fbq) {
    console.warn('Meta Pixel is not initialized yet.')
    return
  }

  const isStandardEvent = [
    'PageView',
    'ViewContent',
    'Search',
    'AddToCart',
    'AddToWishlist',
    'InitiateCheckout',
    'AddPaymentInfo',
    'Purchase',
    'Lead',
    'CompleteRegistration',
    'Contact',
    'CustomizeProduct',
    'Donate',
    'FindLocation',
    'Schedule',
    'StartTrial',
    'SubmitApplication',
    'Subscribe',
  ].includes(eventName)

  if (isStandardEvent) {
    window.fbq('track', eventName, params)
  } else {
    window.fbq('trackCustom', eventName, params)
  }
}
