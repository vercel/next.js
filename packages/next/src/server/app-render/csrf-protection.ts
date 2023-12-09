export const isCsrfOriginAllowed = (
  originDomain: string,
  allowedOrigins: string[] | undefined
): boolean => {
  return (
    allowedOrigins?.some(
      (allowedOrigin) =>
        allowedOrigin && originDomain.match(new RegExp(allowedOrigin))
    ) ?? false
  )
}
