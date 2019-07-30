import Link from 'next/link'

export const config = { experimentalPrerender: true }

const wrapPage = Comp => {
  Comp.getInitialProps = () => ({ world: 'world' })
  return Comp
}

export default wrapPage(({ world }) => (
  <>
    <p>hello {world}</p>
    <Link href='/'>
      <a id='home'>to home</a>
    </Link>
    <br />
    <Link href='/something'>
      <a id='somethin'>to something</a>
    </Link>
  </>
))
