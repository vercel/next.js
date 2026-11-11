// Expected public responses for the authored route fixtures. These constructors
// share request and layout invariants while keeping each HTML/Flight difference
// explicit. They do not inspect the implementation or a test run's output.
const formats = ['html', 'flight']
const query = () => ({ tag: ['one', 'two'], unicode: '✓' })
const params = () => ({ tenant: 'acme', slug: ['alpha', 'c'] })
const context = (request) => ({
  request,
  root: 'acme',
  header: 'request-value',
  cookie: 'session-value',
})
const contentType = (format) =>
  format === 'html' ? 'text/html; charset=utf-8' : 'text/x-component'
const search = (format, extra = '') =>
  '?tag=one&tag=two&unicode=%E2%9C%93' +
  extra +
  (format === 'flight' ? '&_rsc=' : '')
const subject = () => ({
  tenant: 'acme',
  slug: ['alpha', 'c'],
  root: 'acme',
  ...query(),
  header: 'request-value',
  cookie: 'session-value',
})

function accessRows(notFound) {
  const variants = notFound
    ? ['missing', 'following']
    : [
        'forbidden',
        'following-forbidden',
        'unauthorized',
        'following-unauthorized',
      ]
  return variants.flatMap((variant) =>
    formats.map((format) => {
      const interrupted = ['missing', 'forbidden', 'unauthorized'].includes(
        variant
      )
      const fallback = interrupted || format === 'flight'
      const request = variant + '-' + format
      const extra = !interrupted
        ? ''
        : notFound
          ? '&missing=1'
          : '&interrupt=' + variant
      const layouts = !interrupted || format === 'flight'
      return {
        variant,
        format,
        pathname: '/acme/' + (notFound ? 'missing' : 'access') + '/alpha/c',
        search: search(format, extra),
        status:
          !interrupted || format === 'flight'
            ? 200
            : { missing: 404, forbidden: 403, unauthorized: 401 }[variant],
        contentType: contentType(format),
        subject: fallback
          ? { fallback: context(request) }
          : { params: params(), query: query(), ...context(request) },
        subjectTransport:
          format === 'flight'
            ? 'flight'
            : interrupted
              ? 'embedded-flight'
              : 'html',
        rootLayout: layouts,
        nestedLayout: layouts,
        rootProvider: layouts,
        nestedProvider: layouts,
        providerContext: fallback ? null : 'nested:acme',
        clientReference: true,
        robotsNoIndex: interrupted && format === 'html',
        ...(notFound
          ? { notFoundDigest: interrupted }
          : {
              forbiddenDigest: variant === 'forbidden',
              unauthorizedDigest: variant === 'unauthorized',
            }),
        after: request,
      }
    })
  )
}

function redirectRows(streaming) {
  return ['temporary', 'permanent', 'following'].flatMap((variant) =>
    formats.map((format) => {
      const redirect = variant !== 'following'
      const request = variant + '-' + format
      const target = '/acme/late-redirect/target?from=late-' + variant
      const { cookie, ...after } = context(request)
      return {
        variant,
        format,
        pathname: '/acme/late-redirect/alpha/c',
        search: search(format, redirect ? '&redirect=' + variant : ''),
        status: 200,
        contentType: contentType(format),
        location: null,
        redirectDigest: redirect
          ? `NEXT_REDIRECT;replace;${target};${variant === 'temporary' ? 307 : 308};`
          : null,
        refresh:
          redirect && format === 'html'
            ? `${variant === 'temporary' ? 1 : 0};url=${target}`
            : null,
        subject: subject(),
        rootLayout: true,
        nestedLayout: true,
        provider: true,
        ...(streaming
          ? {
              barrier: {
                held: redirect,
                fallbackBeforeRelease: redirect,
                released: redirect,
                fallbackDigestAbsent: redirect ? true : null,
              },
            }
          : {}),
        after,
        resumed: redirect ? context(request) : null,
      }
    })
  )
}

function ownershipRows() {
  function response(format, extra = '', fallback = false) {
    return {
      pathname: '/acme/stream-owner/alpha/c',
      search: search(format, extra),
      status: 200,
      contentType: contentType(format),
      location: null,
      subject: subject(),
      rootLayout: true,
      nestedLayout: true,
      provider: true,
      fallback,
      redirectDigest: null,
      refresh: null,
    }
  }
  return [
    ['cancel', 'native'],
    ['cancel', 'explicit'],
    ['after', 'held'],
    ['after', 'rejected'],
  ].flatMap(([group, kind]) =>
    formats.map((format) => {
      const request = `${group}-${kind}-${format}`
      const cancel = group === 'cancel'
      const extra = cancel
        ? '&redirect=temporary'
        : kind === 'rejected'
          ? '&after=reject'
          : ''
      return {
        group,
        kind,
        format,
        response: response(format, extra, cancel),
        after: {
          ...context(request),
          outcome: kind === 'rejected' ? 'rejected' : 'fulfilled',
        },
        following: response(format),
        followingAfter: {
          ...context('following-' + request),
          outcome: 'fulfilled',
        },
        barrier: { held: true, released: !cancel },
      }
    })
  )
}

function errorRows(mode, flag) {
  function requestContext(request, scope, failed) {
    return {
      ...context(request),
      scope,
      params: params(),
      query: { ...query(), ...(failed ? { fail: '1' } : {}) },
    }
  }
  function response(scope, format, failed, request) {
    const htmlError = failed && format === 'html'
    const nested = scope === 'nested'
    const rootBoundary = '/app/[tenant]/render-error/'
    const boundaries = [
      { source: rootBoundary + 'error.jsx', exportName: 'default' },
      ...(nested
        ? [{ source: rootBoundary + 'nested/error.jsx', exportName: 'default' }]
        : []),
    ]
    const digest = {
      digestLinksOriginalError: true,
      digestMatchesActualHash: true,
      selectedModelReferencesError: true,
    }
    const error =
      mode === 'production'
        ? { serializedFields: ['digest'], ...digest }
        : {
            serializedFields: [
              'digest',
              'env',
              'message',
              'name',
              'owner',
              'stack',
            ],
            name: 'Error',
            message: 'Owned ordinary AppPage render failure',
            env: 'Server',
            ...digest,
            stack: [
              {
                name: 'Subject',
                line: 127,
                column: 23,
                flags: [0, 0, false],
                ownedEmittedSource: true,
              },
            ],
            owner: {
              present: true,
              recordInResponse: flag === 'false',
              ...(flag === 'false' ? { name: 'Page', env: 'Server' } : {}),
            },
          }
    return {
      status: htmlError ? 500 : 200,
      contentType: contentType(format),
      location: null,
      htmlErrorDocument: htmlError,
      rootLayout: !htmlError,
      nestedLayout: !htmlError,
      nestedErrorLayout: nested && !htmlError,
      provider: !htmlError,
      renderedRootErrorBoundary: false,
      renderedNestedErrorBoundary: false,
      templateErrors: [],
      subject: failed ? null : requestContext(request, scope, false),
      boundaries,
      errorFacts: failed ? [error] : [],
    }
  }
  return ['root', 'nested'].flatMap((scope) =>
    formats.map((format) => {
      const request = scope + '-' + format
      const following = 'following-' + request
      return {
        scope,
        format,
        pathname:
          '/acme/render-error/' +
          (scope === 'nested' ? 'nested/' : '') +
          'alpha/c',
        search: search(format, '&fail=1'),
        error: response(scope, format, true, request),
        request: requestContext(request, scope, true),
        after: context(request),
        following: response(scope, format, false, following),
        followingRequest: requestContext(following, scope, false),
        followingAfter: context(following),
      }
    })
  )
}

export function routeModel(kind, mode = 'development', flag = 'default') {
  switch (kind) {
    case 'auth':
      return accessRows(false)
    case 'not-found':
      return accessRows(true)
    case 'late-redirect':
      return redirectRows(false)
    case 'stream-redirect':
      return redirectRows(true)
    case 'stream-ownership':
      return ownershipRows()
    case 'errors':
      return errorRows(mode, flag)
    default:
      throw new Error('Unknown route model: ' + kind)
  }
}
