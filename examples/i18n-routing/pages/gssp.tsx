import type { GetServerSideProps, InferGetServerSidePropsType } from 'next'

import Link from 'next/link'
import { useRouter } from 'next/router'
import LocaleSwitcher from '../components/locale-switcher'

type GsspPageProps = InferGetServerSidePropsType<typeof getServerSideProps>

export default function GsspPage(props: GsspPageProps) {
  const router = useRouter()
  const { defaultLocale } = router

  return (
    <div>
      <h1>getServerSideProps page</h1>
      <p>Current locale: {props.locale}</p>
      <p>Default locale: {defaultLocale}</p>
      <p>Configured locales: {JSON.stringify(props.locales)}</p>

      <LocaleSwitcher />

      <Link href="/gsp">To getStaticProps page</Link>
      <br />

      <Link href="/gsp/first">To dynamic getStaticProps page</Link>
      <br />

      <Link href="/">To index page</Link>
      <br />
    </div>
  )
}

type Props = {
  locale?: string
  locales?: string[]
}

export const getServerSideProps: GetServerSideProps<Props> = async ({
  locale,
  locales,
}) => {
  return {
    props: {
      locale,
      locales,
    },
  }
}
