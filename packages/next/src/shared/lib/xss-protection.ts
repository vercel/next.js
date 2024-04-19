export type UntrustedHref = string
export interface TrustedHref {
  unsafeHref: {
    __href: string
  }
}

const javaScriptProtocol =
  // eslint-disable-next-line no-useless-escape, no-control-regex
  /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*\:/i
export function isJavaScriptProtocol(href: string) {
  // We could just use `new URL(href).protocol === 'javascript:'`
  // But that might be more expensive than this simple regex since it also throws on invalid URLs and `URL` may not be available in every environemnt.
  return javaScriptProtocol.test(href)
}
export function trustHref(href: UntrustedHref | TrustedHref) {
  if (typeof href === 'string') {
    // TODO: `data:`? check why we didn't do this in React.
    if (isJavaScriptProtocol(href)) {
      if (process.env.__NEXT_HARDENED_XSS_PROTECTION) {
        throw new Error(
          'Next.js has blocked a `javascript:` URL as a security precaution.'
        )
      } else if (process.env.NODE_ENV !== 'production') {
        console.error(
          'A future version of Next.js will block `javascript:` URLs as a security precaution. ' +
            'Use event handlers instead if you can. ' +
            // since router.push could be from userland as well as from <Link /> we need to be generic about the cause.
            // The solution would never include <Link /> though.
            // We could make it work by accepting { unsafeUrl } but Link already accepts an object so this would be slightly awkward.
            // It really just depends on user feedback if we need an escape hatch for <Link href="javascript:" />.
            // But since nobody complained so far (even though React 18 warns and 19 will throw), it's probably safe to assume we won't need an escape hatch.
            'If you need to push unsafe URLs, use `router.push({ unsafeHref: { __href: href } })` instead. ' +
            'A client-side navigation to "%s" was triggered.',
          // Do we need to stringify here?
          JSON.stringify(href)
        )
      }
    }

    return href
  } else {
    return href.unsafeHref.__href
  }
}
