import { isMatch } from 'next/dist/compiled/micromatch'

export const isCsrfOriginAllowed = (
  originDomain: string,
  allowedOrigins: string[] | undefined
): boolean => {
  return (
    allowedOrigins?.some(
      (allowedOrigin) =>
        allowedOrigin &&
        (allowedOrigin === originDomain || isMatch(originDomain, allowedOrigin))
    ) ?? false
  )
}
