import type { GetServerSideProps } from 'next'
import { declared } from '../lib/declared/pages-page'
import { undeclared } from '../lib/undeclared/pages-page'
import { read, type Result } from '../lib/use'

export const getServerSideProps: GetServerSideProps<{
  result: Result
}> = async ({ query }) => {
  return {
    props: {
      result: read(
        () => undeclared(),
        () => declared(),
        query.use !== undefined
      ),
    },
  }
}

export default function Page({ result }: { result: Result }) {
  return <p id="result">{JSON.stringify(result)}</p>
}
