import { useRouter } from 'next/router'

const Page = () => {
  return <p>path: {useRouter().query['hello-world']?.join('/')}</p>
}

export default Page

export const getServerSideProps = () => {
  return {
    props: {
      hello: 'world',
    },
  }
}
