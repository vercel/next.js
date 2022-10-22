export { Cookie } from 'next/dist/compiled/@edge-runtime/cookies'
import { ResponseCookies } from 'next/dist/compiled/@edge-runtime/cookies'

export class NextCookies extends ResponseCookies {
  constructor(response: Response | Request) {
    super(response as any) // TODO: Make `ResponseCookies` more general in `@edge-runtime/cookies`?
  }
}
