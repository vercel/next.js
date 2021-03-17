import Link from 'next/link'
import faker from 'faker'

const About = ({ name }) => {
  return (
    <div>
      <h1>About Page</h1>
      <p>Welcome, {name}.</p>
      <p>
        This page is using getStaticProps, so the name will always be {name}{' '}
        even if you reload the page.
      </p>
      <div>
        <Link href="/">
          <a>Home Page</a>
        </Link>
      </div>
    </div>
  )
}

export async function getStaticProps() {
  const name = faker.name.findName()
  return {
    props: {
      name,
    },
  }
}

export default About
