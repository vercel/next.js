import type { IncomingMessage } from 'http'
import type { ReadonlyRequestCookies } from '../web/spec-extension/adapters/request-cookies'
import type { ResponseCookies } from '../web/spec-extension/cookies'
import type { BaseNextRequest } from '../base-http'
import type { NextRequest } from '../web/spec-extension/request'

import {
  COOKIE_NAME_PRERENDER_BYPASS,
  checkIsOnDemandRevalidate,
} from '../api-utils'
import type { __ApiPreviewProps } from '../api-utils'

export class DraftModeProvider {
  public readonly isEnabled: boolean

  /**
   * @internal - this declaration is stripped via `tsc --stripInternal`
   */
  private readonly _previewModeId: string | undefined

  /**
   * @internal - this declaration is stripped via `tsc --stripInternal`
   */
  private readonly _mutableCookies: ResponseCookies

  constructor(
    previewProps: __ApiPreviewProps | undefined,
    req: IncomingMessage | BaseNextRequest<unknown> | NextRequest,
    cookies: ReadonlyRequestCookies,
    mutableCookies: ResponseCookies
  ) {
    // The logic for draftMode() is very similar to tryGetPreviewData()
    // but Draft Mode does not have any data associated with it.
    const isOnDemandRevalidate =
      previewProps &&
      checkIsOnDemandRevalidate(req, previewProps).isOnDemandRevalidate

    const cookieValue = cookies.get(COOKIE_NAME_PRERENDER_BYPASS)?.value

    this.isEnabled = Boolean(
      !isOnDemandRevalidate &&
        cookieValue &&
        previewProps &&
        cookieValue === previewProps.previewModeId
    )

    this._previewModeId = previewProps?.previewModeId
    this._mutableCookies = mutableCookies
  }

  enable() {
    if (!this._previewModeId) {
      throw new Error(
        'Invariant: previewProps missing previewModeId this should never happen'
      )
    }

    this._mutableCookies.set({
      name: COOKIE_NAME_PRERENDER_BYPASS,
      value: this._previewModeId,
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
    this._mutableCookies.set({
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
