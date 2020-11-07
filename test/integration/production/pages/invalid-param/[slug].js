import { useRouter } from 'next/router'

export default function Page() {
  return <p>hello {useRouter().query}</p>
}

export const getServerSideProps = () => {
  return {
    props: {
      hello: 'world',
    },
  }
}
