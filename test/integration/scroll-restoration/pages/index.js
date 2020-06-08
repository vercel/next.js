import Link from 'next/link'

const Page = ({ loaded }) => {
  const link = (
    <Link href="/another">
      <a id="to-another">to another</a>
    </Link>
  )

  if (loaded) {
    return (
      <>
        <div
          style={{
            width: 50,
            height: 10000,
            background: 'orange',
          }}
        />
        {link}
        <div id="end-el">the end</div>
      </>
    )
  }

  return link
}

export default Page

export const getServerSideProps = () => {
  return {
    props: {
      loaded: true,
    },
  }
}
