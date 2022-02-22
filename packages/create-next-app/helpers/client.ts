/* eslint-disable import/no-extraneous-dependencies */
import got from 'got'
import { HttpsProxyAgent } from 'hpagent'

function getAgent() {
  if (process.env.https_proxy) {
    return {
      https: new HttpsProxyAgent({
        proxy: process.env.https_proxy,
        rejectUnauthorized: false,
      }),
    }
  }
}

export default got.extend({ agent: getAgent() })
