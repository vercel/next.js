/**
 * Example usage README.md#hnrequest
 */

type RequestOptions = Partial<Request>

type ResponseObject = {
  hasError: boolean
  error?: object | string | null
}

type JSONResponseType = ResponseObject & {
  message?: string
  data?: object
}

type TextResponseType = ResponseObject & {
  data?: string
}

/**
 * HNRequest
 * A wrapper class to prepare, execute and has .json(), .text() with try/catch wrapped
 */
export class HNRequest {
  url: string

  public rawResponse?: Response

  public requestObj: { [key: string]: any } = {}

  public responseObj: any = { hasError: false }

  private get hasError() {
    return !!this.responseObj?.hasError
  }

  private set hasError(status: boolean) {
    this.responseObj.hasError = status
  }

  /**
   * @param url - Request url
   * @param opts - Object of options for fetch()
   */
  constructor(url: string, opts: any) {
    this.url = url
    const { headers = {}, ...restOfTheOpts } = opts
    this.requestObj = {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...headers,
      },
      ...restOfTheOpts,
    }
  }

  /**
   * @param opts - RequestOptions - Fetch's Request type
   * @returns void
   */
  prepare = (opts: RequestOptions) => {
    const { headers, body, ...restOfTheOptions } = opts
    this.requestObj = {
      ...headers,
      body: JSON.stringify(body),
      ...restOfTheOptions,
    }
  }

  /**
   * Makes the actual request and sets `rawResponse`.
   * You can use the `rawResponse` property of the instance
   * to handle the response manually
   * @returns void
   */
  exec = async () => {
    try {
      this.rawResponse = await fetch(this.url, this.requestObj)
    } catch (error) {
      this.responseObj.error = error
      this.hasError = true
    }
  }

  json = async (): Promise<JSONResponseType> => {
    if (this.hasError) {
      return this.responseObj
    }

    try {
      const json = await this.rawResponse?.json()
      const { data, message, error } = json
      this.responseObj = {
        data,
        message,
        error,
        hasError: this.hasError,
      }
    } catch (error) {
      this.hasError = true
      this.responseObj.error = error
    }
    return this.responseObj
  }

  text = async (): Promise<TextResponseType> => {
    if (this.hasError) {
      return this.responseObj
    }

    try {
      const text = await this.rawResponse?.text()
      this.responseObj.data = text
    } catch (error) {
      this.hasError = true
      this.responseObj.error = error
    }
    return this.responseObj
  }
}
