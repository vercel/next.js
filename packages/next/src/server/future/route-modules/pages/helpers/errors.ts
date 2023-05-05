import {
  GSP_NO_RETURNED_VALUE,
  GSSP_NO_RETURNED_VALUE,
  UNSTABLE_REVALIDATE_RENAME_ERROR,
} from '../../../../../lib/constants'

export class NoReturnedValueError extends Error {
  public constructor(methodName: 'getServerSideProps' | 'getStaticProps') {
    super(
      methodName === 'getStaticProps'
        ? GSP_NO_RETURNED_VALUE
        : GSSP_NO_RETURNED_VALUE
    )
  }
}

export class InvalidUnstableRevalidateRenameError extends Error {
  public constructor() {
    super(UNSTABLE_REVALIDATE_RENAME_ERROR)
  }
}

export class InvalidKeyRenameError extends Error {
  public constructor(previous: string, current: string) {
    super(
      `'${previous}' has been renamed to '${current}', please update the field to continue.`
    )
  }
}

export class InvalidKeysError extends Error {
  public constructor(
    methodName: 'getServerSideProps' | 'getStaticProps',
    invalidKeys: string[]
  ) {
    const docsPathname = `invalid-${methodName.toLowerCase()}-value`

    super(
      `Additional keys were returned from \`${methodName}\`. Properties intended for your component must be nested under the \`props\` key, e.g.:` +
        `\n\n\treturn { props: { title: 'My Title', content: '...' } }` +
        `\n\nKeys that need to be moved: ${invalidKeys.join(', ')}.` +
        `\nRead more: https://nextjs.org/docs/messages/${docsPathname}`
    )
  }
}
