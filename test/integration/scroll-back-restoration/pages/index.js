import Link from 'next/link'

const Page = ({ loaded }) => {
  const link = (
    <Link
      href="/another"
      id="to-another"
      style={{
        marginLeft: 5000,
        width: 95000,
        display: 'block',
      }}
    >
      to another
    </Link>
  )

  if (typeof window !== 'undefined') {
    window.didHydrate = true
  }

  if (loaded) {
    return (
      <>
        <div
          style={{
            width: 10000,
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
