import type { IncomingMessage } from 'http'
import type { ReadonlyRequestCookies } from '../web/spec-extension/adapters/request-cookies'
import type { ResponseCookies } from '../web/spec-extension/cookies'
import type { BaseNextRequest } from '../base-http'
import type { NextRequest } from '../web/spec-extension/request'

import {
  COOKIE_NAME_PRERENDER_BYPASS,
  COOKIE_NAME_PRERENDER_DATA,
  checkIsOnDemandRevalidate,
} from '../api-utils'
import type { __ApiPreviewProps } from '../api-utils'

export class DraftModeProvider {
  private _isEnabled: boolean
  private readonly _previewModeId: string | undefined
  private readonly _mutableCookies: ResponseCookies
  private _data: any = null

  constructor(
    previewProps: __ApiPreviewProps | undefined,
    req: IncomingMessage | BaseNextRequest<unknown> | NextRequest,
    cookies: ReadonlyRequestCookies,
    mutableCookies: ResponseCookies
  ) {
    const isOnDemandRevalidate =
      previewProps &&
      checkIsOnDemandRevalidate(req, previewProps).isOnDemandRevalidate

    const cookieValue = cookies.get(COOKIE_NAME_PRERENDER_BYPASS)?.value
    const dataCookie = cookies.get(COOKIE_NAME_PRERENDER_DATA)?.value

    this._isEnabled = Boolean(
      !isOnDemandRevalidate &&
        cookieValue &&
        previewProps &&
        (cookieValue === previewProps.previewModeId ||
          (process.env.NODE_ENV !== 'production' &&
            previewProps.previewModeId === 'development-id'))
    )

    if (this._isEnabled && dataCookie) {
      try {
        this._data = JSON.parse(dataCookie)
      } catch {
        this._data = null
      }
    }

    this._previewModeId = previewProps?.previewModeId
    this._mutableCookies = mutableCookies
  }

  get isEnabled() {
    return this._isEnabled
  }

  get data() {
    return this._data
  }

  enable(data?: any) {
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

    if (data !== undefined) {
      this._data = data
      this._mutableCookies.set({
        name: COOKIE_NAME_PRERENDER_DATA,
        value: JSON.stringify(data),
        httpOnly: true,
        sameSite: process.env.NODE_ENV !== 'development' ? 'none' : 'lax',
        secure: process.env.NODE_ENV !== 'development',
        path: '/',
      })
    }

    this._isEnabled = true
  }

  disable() {
    this._mutableCookies.set({
      name: COOKIE_NAME_PRERENDER_BYPASS,
      value: '',
      httpOnly: true,
      sameSite: process.env.NODE_ENV !== 'development' ? 'none' : 'lax',
      secure: process.env.NODE_ENV !== 'development',
      path: '/',
      expires: new Date(0),
    })

    this._mutableCookies.set({
      name: COOKIE_NAME_PRERENDER_DATA,
      value: '',
      httpOnly: true,
      sameSite: process.env.NODE_ENV !== 'development' ? 'none' : 'lax',
      secure: process.env.NODE_ENV !== 'development',
      path: '/',
      expires: new Date(0),
    })

    this._isEnabled = false
    this._data = null
  }
}
