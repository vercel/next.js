import type { IncomingMessage } from 'http'
import type { ReadonlyRequestCookies } from '../web/spec-extension/adapters/request-cookies'
import type { ResponseCookies } from '../web/spec-extension/cookies'
import type { BaseNextRequest } from '../base-http'
import type { NextRequest } from '../web/spec-extension/request'

import {
  COOKIE_NAME_PRERENDER_BYPASS,
  checkIsOnDemandRevalidate,
  __ApiPreviewProps,
} from '../api-utils'

export class DraftMode {
  public readonly enabled: boolean

  private readonly previewModeId: string | undefined

  constructor(
    previewProps: __ApiPreviewProps | undefined,
    req: IncomingMessage | BaseNextRequest<unknown> | NextRequest,
    private readonly cookies: ReadonlyRequestCookies,
    private readonly mutableCookies: ResponseCookies
  ) {
    // The logic for draftMode() is very similar to tryGetPreviewData()
    // but Draft Mode does not have any data associated with it.
    const isOnDemandRevalidate =
      previewProps &&
      checkIsOnDemandRevalidate(req, previewProps).isOnDemandRevalidate

    const cookieValue = this.cookies.get(COOKIE_NAME_PRERENDER_BYPASS)?.value

    this.enabled = Boolean(
      !isOnDemandRevalidate &&
        cookieValue &&
        previewProps &&
        cookieValue === previewProps.previewModeId
    )

    this.previewModeId = previewProps?.previewModeId
  }

  enable() {
    if (!this.previewModeId) {
      throw new Error(
        'Invariant: previewProps missing previewModeId this should not be hit'
      )
    }

    this.mutableCookies.set({
      name: COOKIE_NAME_PRERENDER_BYPASS,
      value: this.previewModeId,
      httpOnly: true,
      sameSite: process.env.NODE_ENV !== 'development' ? 'none' : 'lax',
      secure: process.env.NODE_ENV !== 'development',
      path: '/',
    })
  }

  disable() {
    // To delete a cookie, set `expires` to a date in the past:
    // https://tools.ietf.org/html/rfc6265#section-4.1.1
    // `Max-Age: 0` is not valid, thus ignored, and the cookie is persisted.
    this.mutableCookies.set({
      name: COOKIE_NAME_PRERENDER_BYPASS,
      value: '',
      httpOnly: true,
      sameSite: process.env.NODE_ENV !== 'development' ? 'none' : 'lax',
      secure: process.env.NODE_ENV !== 'development',
      path: '/',
      expires: new Date(0),
    })
  }
}
