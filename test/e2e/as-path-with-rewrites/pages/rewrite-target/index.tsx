import { GetServerSidePropsContext } from 'next'
import { useRouter } from 'next/router'

export async function getServerSideProps(context: GetServerSidePropsContext) {
  return { props: {} }
}

export default function RewriteTarget() {
  const router = useRouter()

  return <h1>rewrite-target: {router.asPath}</h1>
}
