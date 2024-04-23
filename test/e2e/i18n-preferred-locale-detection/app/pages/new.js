import Link from 'next/link'

export const getServerSideProps = async ({ locale }) => {
  return {
    props: {
      locale,
    },
  }
}

export default function New({ locale }) {
  return (
    <div>
      <div id="new">New</div>
      <div id="current-locale">{locale}</div>
      <Link href="/" id="to-index">
        To index (No Locale Specified)
      </Link>
    </div>
  )
}
