// eslint-disable-next-line no-unused-vars
export { config as notConfig } from '../../config'

export const getServerSideProps = () => {
  return {
    props: {},
  }
}

const NotConfigExport = () => <p>hello world</p>

export default NotConfigExport
