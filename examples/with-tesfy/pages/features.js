import { Feature } from 'react-tesfy'
import { getTesfyProps } from '../utils'

export const getServerSideProps = getTesfyProps(async () => {
  return { props: {} }
})

const FeaturesPage = () => {
  return (
    <>
      <h1>Features</h1>

      <section>
        <h2>Feature 1 - Allocation</h2>
        <Feature id="feature-1">
          {(isEnabled) => (isEnabled ? <p>Enabled</p> : <p>Disabled</p>)}
        </Feature>
      </section>
    </>
  )
}

export default FeaturesPage
