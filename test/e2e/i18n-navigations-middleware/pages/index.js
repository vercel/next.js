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
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      <p id="current-locale">Current locale: {locale}</p>
      Locale switch:
      <Link href="/" locale="default">
        Default
      </Link>
      <Link href="/" locale="en">
        English
      </Link>
      <Link href="/" locale="de">
        German
      </Link>
      <br />
      Test links:
      <Link href="/dynamic/1">Dynamic 1</Link>
      <Link href="/static">Static</Link>
    </main>
  )
}
