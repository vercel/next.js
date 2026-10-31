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

let formSubmitBridgeAttached = false

/**
 * Forwards client-side form submissions to the dataLayer as `form_submit`
 * events.
 *
 * GA4 enhanced measurement auto-collects `form_submit` only for native form
 * submissions. When a submit is handled client-side — `next/form`
 * navigation, React server actions, or any `preventDefault()`-based AJAX
 * handler — gtag observes the prevented submit and emits nothing, so the
 * submission is never tracked (only `form_start` fires).
 *
 * This bridge listens for submits at the document level (bubble phase, so it
 * runs after React's listeners) and forwards the ones that were prevented,
 * mirroring enhanced measurement's `form_submit` parameters. Native
 * (non-prevented) submits are left to enhanced measurement to avoid
 * double-counting.
 *
 * See https://github.com/vercel/next.js/issues/100938
 */
function attachFormSubmitBridge() {
  if (formSubmitBridgeAttached || typeof document === 'undefined') {
    return
  }
  formSubmitBridgeAttached = true

  document.addEventListener('submit', (event: Event) => {
    const form = event.target
    if (!(form instanceof HTMLFormElement)) {
      return
    }
    if (!event.defaultPrevented) {
      // Native submission — enhanced measurement auto-collects form_submit.
      return
    }
    if (currDataLayerName === undefined || !window[currDataLayerName]) {
      return
    }
    const params: Record<string, string | number> = {
      form_destination: form.action,
      form_length: form.elements.length,
    }
    if (form.id) {
      params.form_id = form.id
    }
    const formName = form.getAttribute('name')
    if (formName) {
      params.form_name = formName
    }
    const submitter = (event as SubmitEvent).submitter
    const submitText =
      submitter instanceof HTMLInputElement
        ? submitter.value || null
        : submitter?.textContent?.trim() || null
    if (submitText) {
      params.form_submit_text = submitText.slice(0, 100)
    }
    sendGAEvent('event', 'form_submit', params)
  })
}

export function GoogleAnalytics(props: GAParams) {
  const { gaId, debugMode, dataLayerName = 'dataLayer', nonce } = props

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

    // Bridge client-side form submissions (next/form, server actions) that
    // enhanced measurement would otherwise miss. Attaches once globally.
    attachFormSubmitBridge()
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

          gtag('config', '${gaId}' ${debugMode ? ",{ 'debug_mode': true }" : ''});`,
        }}
        nonce={nonce}
      />
      <Script
        id="_next-ga"
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        nonce={nonce}
      />
    </>
  )
}

export function sendGAEvent(..._args: Object[]) {
  if (currDataLayerName === undefined) {
    console.warn(`@next/third-parties: GA has not been initialized`)
    return
  }

  if (window[currDataLayerName]) {
    window[currDataLayerName].push(arguments)
  } else {
    console.warn(
      `@next/third-parties: GA dataLayer ${currDataLayerName} does not exist`
    )
  }
}
