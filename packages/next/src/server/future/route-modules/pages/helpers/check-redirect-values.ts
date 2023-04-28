import type { IncomingMessage } from 'http'
import type { Redirect } from '../../../../../../types'

import {
  allowedStatusCodes,
  getRedirectStatus,
} from '../../../../../lib/redirect-status'

export type RedirectPropsResult = {
  redirect: Redirect
  revalidate?: number | boolean
  props: {
    __N_REDIRECT: string
    __N_REDIRECT_STATUS: number
    __N_REDIRECT_BASE_PATH?: boolean
  }
}

export function checkRedirectValues(
  { redirect, revalidate }: Omit<RedirectPropsResult, 'props'>,
  url: string,
  method: 'getStaticProps' | 'getServerSideProps'
): RedirectPropsResult {
  const { destination, basePath } = redirect
  const errors: string[] = []

  const hasStatusCode =
    'statusCode' in redirect && typeof redirect.statusCode !== 'undefined'
  const hasPermanent =
    'permanent' in redirect && typeof redirect.permanent !== 'undefined'

  if (hasPermanent && hasStatusCode) {
    errors.push(`\`permanent\` and \`statusCode\` can not both be provided`)
  } else if (hasPermanent && typeof redirect.permanent !== 'boolean') {
    errors.push(`\`permanent\` must be \`true\` or \`false\``)
  } else if (hasStatusCode && !allowedStatusCodes.has(redirect.statusCode)) {
    errors.push(
      `\`statusCode\` must undefined or one of ${[...allowedStatusCodes].join(
        ', '
      )}`
    )
  }
  const destinationType = typeof destination

  if (destinationType !== 'string') {
    errors.push(
      `\`destination\` should be string but received ${destinationType}`
    )
  }

  if (typeof basePath !== 'undefined' && typeof basePath !== 'boolean') {
    errors.push(
      `\`basePath\` should be undefined or a false, received ${typeof basePath}`
    )
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid redirect object returned from ${method} for ${url}\n` +
        errors.join(' and ') +
        '\n' +
        `See more info here: https://nextjs.org/docs/messages/invalid-redirect-gssp`
    )
  }

  // Create the new redirect object.
  const data: RedirectPropsResult = {
    redirect,
    revalidate,
    props: {
      __N_REDIRECT: destination,
      __N_REDIRECT_STATUS: getRedirectStatus(redirect),
    },
  }

  if (typeof data.redirect.basePath !== 'undefined') {
    data.props.__N_REDIRECT_BASE_PATH = data.redirect.basePath
  }

  return data
}
