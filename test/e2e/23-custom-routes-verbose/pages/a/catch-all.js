import { useRouter } from 'next/router'

export default () => <p>{useRouter().query.path?.join('/')}</p>

export const getServerSideProps = () => {
  return {
    props: {},
  }
}
