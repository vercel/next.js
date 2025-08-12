import Link from 'next/link'

const Slug = (props) => {
  return (
    <div>
      <p id="props">{JSON.stringify(props)}</p>
      <Link href="/gsp/blocking/hallo-wereld" locale={'nl-NL'}>
        <a>/nl-NL/gsp/blocking/hallo-wereld</a>
      </Link>
      <br />
      <Link href="/gsp/blocking/42" locale={'nl-NL'}>
        <a>/nl-NL/gsp/blocking/42</a>
      </Link>
      <br />
      <Link href="/gsp/blocking/hallo-welt" locale={'fr'}>
        <a>/fr/gsp/blocking/hallo-welt</a>
      </Link>
      <br />
      <Link href="/gsp/blocking/42" locale={'fr'}>
        <a>/fr/gsp/blocking/42</a>
      </Link>
    </div>
  )
}

export const getStaticProps = () => {
  return {
    props: {
      random: Math.random() + Date.now(),
      catchall: 'yes',
    },
    revalidate: 1,
  }
}

export const getStaticPaths = () => {
  return {
    paths: [],
    fallback: 'blocking',
  }
}

export default Slug
