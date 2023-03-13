import { Experiment, Variation } from 'react-tesfy'
import { getTesfyProps } from '../utils'

export const getServerSideProps = getTesfyProps(async () => {
  return { props: {} }
})

const IndexPage = () => {
  return (
    <>
      <h1>Experiments</h1>

      <section>
        <h2>Experiment 1 - Allocation</h2>
        <Experiment id="experiment-1">
          <Variation>
            <p style={{ color: 'yellow' }}>Yellow</p>
          </Variation>
          <Variation id="0">
            <p style={{ color: 'blue' }}>Blue</p>
          </Variation>
          <Variation id="1">
            <p style={{ color: 'red' }}>Red</p>
          </Variation>
        </Experiment>
      </section>

      <section>
        <h2>Experiment 2 - Audience</h2>
        <Experiment id="experiment-2" attributes={{ countryCode: 'us' }}>
          <Variation>
            <p style={{ fontWeight: 'bold' }}>Bold</p>
          </Variation>
          <Variation id="0">
            <p>Normal</p>
          </Variation>
        </Experiment>
      </section>
    </>
  )
}

export default IndexPage
