import { NextPage } from 'next'
import HelloWorld from '../components'

const HomePage: NextPage = () => {
  return (
    <div>
      <h1>Simple Storybook Example</h1>
      <HelloWorld />
    </div>
  )
}

export default HomePage
