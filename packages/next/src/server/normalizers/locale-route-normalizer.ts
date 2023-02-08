import { Normalizer } from './normalizer'

export class LocaleRouteNormalizer implements Normalizer {
  private readonly lowerCase: ReadonlyArray<string>

  constructor(private readonly locales: ReadonlyArray<string> | null = null) {
    this.lowerCase =
      locales && locales.length > 0
        ? locales.map((locale) => locale.toLowerCase())
        : []
  }

  private match(pathname: string): string | null {
    if (!this.locales) return null

    // The first segment will be empty, because it has a leading `/`. If
    // there is no further segment, there is no locale.
    const segments = pathname.split('/')
    if (!segments[1]) return null

    // The second segment will contain the locale part if any.
    const segment = segments[1].toLowerCase()

    // See if the segment matches one of the locales.
    const index = this.lowerCase.indexOf(segment)
    if (index < 0) return null

    // Return the case-sensitive locale.
    return this.locales[index]
  }

  public normalize(pathname: string): string {
    if (!this.locales) return pathname

    const locale = this.match(pathname)
    if (!locale) return pathname

    // Remove the `/${locale}` part of the pathname.
    return pathname.slice(locale.length + 1) || '/'
  }
}
