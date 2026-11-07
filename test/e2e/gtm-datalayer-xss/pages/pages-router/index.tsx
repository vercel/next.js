import type { GetServerSideProps } from 'next'
import { GoogleTagManager } from '@next/third-parties/google'

export const getServerSideProps: GetServerSideProps = async ({ query }) => {
  const q = typeof query.q === 'string' ? query.q : ''
  return { props: { q } }
}

export default function Page({ q }: { q: string }) {
  return (
    <>
      <p id="probe">q = {q}</p>
      <GoogleTagManager gtmId="GTM-XYZ" dataLayer={{ q }} />
    </>
  )
}
