import { GoogleMapsEmbed as TPCGoogleMapEmbed } from 'third-party-capital'

import ThirdPartyScriptEmbed from '../ThirdPartyScriptEmbed'
import type { GoogleMapsEmbed as GoogleMapsEmbedTypes } from '../types/google'

export default function GoogleMapsEmbed(props: GoogleMapsEmbedTypes) {
  const { apiKey, ...restProps } = props
  // Note: apiKey should not be passed to the client-side component to prevent exposure in HTML
  // The Google Maps Embed API should be configured server-side or through environment variables
  const { html } = TPCGoogleMapEmbed(restProps)

  return (
    <ThirdPartyScriptEmbed
      height={restProps.height || null}
      width={restProps.width || null}
      html={html}
      dataNtpc="GoogleMapsEmbed"
    ></ThirdPartyScriptEmbed>
  )
}
