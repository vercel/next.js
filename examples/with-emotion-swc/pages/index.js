import { Animated, Basic, bounce, Combined, Pink } from '../shared/styles'

const Home = () => (
  <div>
    <Basic>Cool Styles</Basic>
    <Pink>Pink text</Pink>
    <Combined>
      With <code>:hover</code>.
    </Combined>
    <Animated animation={bounce}>Let's bounce.</Animated>
  </div>
)

export default Home
