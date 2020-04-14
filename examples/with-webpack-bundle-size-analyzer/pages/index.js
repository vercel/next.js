import Link from 'next/link'
import faker from 'faker'

const Index = ({ name }) => {
  return (
    <div>
      <h1>Home Page</h1>
      <p>Welcome, {name}.</p>
      <p>
        This page is using getServerSideProps, so the name will be different
        every time the page is rendered.
      </p>
      <div>
        <Link href="/about">
          <a>About Page</a>
        </Link>
      </div>
    </div>
  )
}

export async function getServerSideProps() {
  const name = faker.name.findName()
  return {
    props: {
      name,
    },
  }
}

export default Index
