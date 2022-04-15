import { Animated, Basic, bounce, Combined } from '../shared/styles'

const Home = () => (
  <div>
    <Basic>Cool Styles</Basic>
    <Combined>
      With <code>:hover</code>.
    </Combined>
    <Animated animation={bounce}>Let&#39;s bounce.</Animated>
  </div>
)

export default Home
