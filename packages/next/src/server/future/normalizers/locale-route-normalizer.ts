import { Normalizer } from './normalizer'

export interface LocaleRouteNormalizer extends Normalizer {
  readonly locales: ReadonlyArray<string>
  readonly defaultLocale: string
  match(
    pathname: string,
    options?: { inferDefaultLocale: boolean }
  ): { detectedLocale?: string; pathname: string }
}

export class LocaleRouteNormalizer implements Normalizer {
  private readonly lowerCase: ReadonlyArray<string>

  constructor(
    public readonly locales: ReadonlyArray<string>,
    public readonly defaultLocale: string
  ) {
    this.lowerCase = locales.map((locale) => locale.toLowerCase())
  }

  public match(
    pathname: string,
    options?: { inferDefaultLocale: boolean }
  ): {
    pathname: string
    detectedLocale?: string
  } {
    let detectedLocale: string | undefined = options?.inferDefaultLocale
      ? this.defaultLocale
      : undefined
    if (this.locales.length === 0) return { detectedLocale, pathname }

    // The first segment will be empty, because it has a leading `/`. If
    // there is no further segment, there is no locale.
    const segments = pathname.split('/')
    if (!segments[1]) return { detectedLocale, pathname }

    // The second segment will contain the locale part if any.
    const segment = segments[1].toLowerCase()

    // See if the segment matches one of the locales.
    const index = this.lowerCase.indexOf(segment)
    if (index < 0) return { detectedLocale, pathname }

    // Return the case-sensitive locale.
    detectedLocale = this.locales[index]

    // Remove the `/${locale}` part of the pathname.
    pathname = pathname.slice(detectedLocale.length + 1) || '/'

    return { detectedLocale, pathname }
  }

  public normalize(pathname: string): string {
    const match = this.match(pathname)
    return match.pathname
  }
}
