import { GetServerSideProps, NextPage } from 'next'

interface ServerProps {
  ms: number
}
const Server: NextPage<ServerProps> = props => {
  console.log('server props', props)
  return <div>{props.ms}∏</div>
}

export const getServerSideProps: GetServerSideProps<ServerProps> = () => {
  return new Promise(resolve => {
    resolve({ props: { ms: new Date().getTime() } })
  })
}

export default Server
