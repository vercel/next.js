// eslint-disable-next-line no-unused-vars
import { config } from '../../config'

export { config as notConfig }

export const getServerSideProps = () => {
  return {
    props: {},
  }
}

const NotConfigImportExport = () => <p>hello world</p>

export default NotConfigImportExport
