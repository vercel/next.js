import getConfig from 'next/config'

const config = getConfig()

export default (req, res) => {
  res.json(config)
}
