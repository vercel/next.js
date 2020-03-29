import { NextPage } from 'next'

const Static: NextPage = props => {
  console.log('static props', props)
  return <div>{new Date().getTime()}</div>
}

export default Static
