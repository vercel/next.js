import type {
  GetServerSidePropsResult,
  GetStaticPropsResult,
} from '../../../../../../types'

import {
  InvalidKeyRenameError,
  InvalidKeysError,
  InvalidUnstableRevalidateRenameError,
  NoReturnedValueError,
} from './errors'

function getInvalidKeys(
  props: GetStaticPropsResult<unknown> | GetServerSidePropsResult<unknown>,
  keys: string[]
): string[] {
  return Object.keys(props).filter((key) => !keys.includes(key))
}

const VALID_GET_STATIC_PROP_KEYS = [
  'revalidate',
  'props',
  'redirect',
  'notFound',
]

export function validateGetStaticProps(
  props: GetStaticPropsResult<unknown>
): void {
  if (typeof props === 'undefined' || props === null) {
    throw new NoReturnedValueError('getStaticProps')
  }

  const invalidKeys = getInvalidKeys(props, VALID_GET_STATIC_PROP_KEYS)
  if (invalidKeys.length > 0) {
    if (invalidKeys.includes('unstable_revalidate')) {
      throw new InvalidUnstableRevalidateRenameError()
    }

    throw new InvalidKeysError('getStaticProps', invalidKeys)
  }
}

const VALID_GET_SERVER_SIDE_PROP_KEYS = ['props', 'redirect', 'notFound']

export function validateGetServerSideProps(
  props: GetServerSidePropsResult<unknown>
): void {
  if (typeof props === 'undefined' || props === null) {
    throw new NoReturnedValueError('getServerSideProps')
  }

  const invalidKeys = getInvalidKeys(props, VALID_GET_SERVER_SIDE_PROP_KEYS)
  if (invalidKeys.length > 0) {
    if (invalidKeys.includes('unstable_notFound')) {
      throw new InvalidKeyRenameError('unstable_notFound', 'notFound')
    }
    if (invalidKeys.includes('unstable_redirect')) {
      throw new InvalidKeyRenameError('unstable_redirect', 'redirect')
    }

    throw new InvalidKeysError('getServerSideProps', invalidKeys)
  }
}
