import Link from 'next/link'

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

export async function getServerSideProps({ req }) {
  if (req) {
    // Runs only in the server
    const faker = require('faker')
    const name = faker.name.findName()
    return {
      props: {
        name,
      },
    }
  }
}

export default Index
