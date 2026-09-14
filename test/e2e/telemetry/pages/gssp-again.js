import http from 'http'
import config from './data.json'

export default () => 'Hello World'

export function getServerSideProps() {
  console.log(http)
  console.log(config)
  return { props: {} }
}
