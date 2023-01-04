import { NextPage, GetStaticProps } from 'next'
import Link from 'next/link'
import { faker } from '@faker-js/faker'

type IndexProps = {
  name: string
}

const Index: NextPage<IndexProps> = ({ name }) => {
  return (
    <div>
      <h1>Home Page</h1>
      <p>Welcome, {name}</p>
      <div>
        <Link href="/about">About Page</Link>
      </div>
    </div>
  )
}

export default Index

export const getStaticProps: GetStaticProps = async () => {
  // The name will be generated at build time only
  const name = faker.name.findName()

  return {
    props: { name },
  }
}
