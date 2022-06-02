import getDatafile from './getDatafile'
import getUserId from './getUserId'

const getTesfyProps = (getServerSideProps) => async (ctx) => {
  const datafile = getDatafile()
  const userId = getUserId(ctx)

  const data = (await getServerSideProps(ctx)) || {}

  return { ...data, props: { ...data.props, datafile, userId } }
}

export default getTesfyProps
