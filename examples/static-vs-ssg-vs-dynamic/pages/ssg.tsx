import { GetStaticProps, NextPage } from 'next'

interface SsgProps {
  ms: number
}
const Ssg: NextPage<SsgProps> = props => {
  console.log('ssg props', props)
  return <div>{props.ms}</div>
}

export const getStaticProps: GetStaticProps<SsgProps> = () => {
  return new Promise(resolve => {
    resolve({ props: { ms: new Date().getTime() } })
  })
}

export default Ssg
