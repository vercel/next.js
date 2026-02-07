import { GetServerSideProps } from 'next'

interface Props {
  message: string
}

export default function Page({ message }: Props) {
  console.log('Pages Router isomorphic: This is a log message from render')
  return (
    <div>
      <h1>Pages Router Server-Side Props Test</h1>
      <p>{message}</p>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  console.log('Pages Router SSR: This is a log message from getServerSideProps')
  console.error(
    'Pages Router SSR: This is an error message from getServerSideProps'
  )
  console.warn(
    'Pages Router SSR: This is a warning message from getServerSideProps'
  )

  return {
    props: {
      message: 'Server-side props executed successfully',
    },
  }
}
