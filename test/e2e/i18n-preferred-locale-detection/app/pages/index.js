import Link from 'next/link'

export const getServerSideProps = async ({ locale }) => {
  return {
    props: {
      locale,
    },
  }
}

export default function Home({ locale }) {
  return (
    <div>
      <div id="index">Index</div>
      <div id="current-locale">{locale}</div>
      <Link href="/new" id="to-new">
        To new
      </Link>
    </div>
  )
}
