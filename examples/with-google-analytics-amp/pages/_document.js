import React from 'react'
import Document, { Head, Main, NextScript } from 'next/document'
import { useAmp } from 'next/amp'

import { GA_TRACKING_ID } from '../lib/gtag'

function AmpWrap({ ampOnly, nonAmp }) {
  const isAmp = useAmp()
  if (ampOnly) return isAmp && ampOnly
  return !isAmp && nonAmp
}

export default class extends Document {
  render() {
    return (
      <html>
        <Head>
          <AmpWrap
            ampOnly={
              <script
                async
                key="amp-analytics"
                custom-element="amp-analytics"
                src="https://cdn.ampproject.org/v0/amp-analytics-0.1.js"
              />
            }
          />
          <AmpWrap
            ampOnly={
              <script
                async
                custom-element="amp-form"
                src="https://cdn.ampproject.org/v0/amp-form-0.1.js"
              />
            }
          />
        </Head>
        <body>
          <Main />
          <NextScript />

          {/* AMP - Google Analytics */}
          <AmpWrap
            ampOnly={
              <amp-analytics
                type="googleanalytics"
                id="analytics1"
                data-credentials="include"
              >
                <script
                  type="application/json"
                  dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                      vars: {
                        account: GA_TRACKING_ID,
                        gtag_id: GA_TRACKING_ID,
                        config: {
                          GA_TRACKING_ID: { groups: 'default' },
                        },
                      },
                      triggers: {
                        trackPageview: {
                          on: 'visible',
                          request: 'pageview',
                        },
                      },
                    }),
                  }}
                />
              </amp-analytics>
            }
          />

          {/* Non-AMP - Google Analytics */}
          <AmpWrap
            nonAmp={
              <>
                <script
                  async
                  src={`https://www.googletagmanager.com/gtag/js?id=${GA_TRACKING_ID}`}
                />
                <script
                  dangerouslySetInnerHTML={{
                    __html: `
                      window.dataLayer = window.dataLayer || [];
                      function gtag(){dataLayer.push(arguments);}
                      gtag('js', new Date());

                      gtag('config', '${GA_TRACKING_ID}');
                    `,
                  }}
                />
              </>
            }
          />
        </body>
      </html>
    )
  }
}
