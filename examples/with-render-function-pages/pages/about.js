import Layout from '../components/Layout'

const About = () => (
  <div>
    The counter lives on because these pages use render functions!
  </div>
)

export default function render () {
  return (
    <Layout>
      <About />
    </Layout>
  )
}
