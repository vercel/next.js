import { useRouter } from 'next/router'

export const getServerSideProps = ({ req }) => {
  return {
    props: {
      hello: 'world',
      random: Math.random(),
    },
  }
}

export default function Page(props) {
  const router = useRouter()
  return (
    <>
      <p id="index">index page</p>
      <p id="router">{JSON.stringify(router)}</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}
