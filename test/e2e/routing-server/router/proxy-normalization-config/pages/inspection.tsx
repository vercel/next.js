import type { GetServerSideProps } from 'next'

export default function Inspection() {
  return <p>destination ran instead of Proxy</p>
}

export const getServerSideProps: GetServerSideProps = async () => ({
  props: {},
})
