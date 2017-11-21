import micro from 'micro'
import UrlPattern from 'url-pattern'

export default (rules) => {
  const patterns = rules.map(({ pathname, zone }) => ({
    pathname: new UrlPattern(pathname),
    zone
  }))

  return micro(async (req, res) => {
    for (const { pathname, zone } of patterns) {
      if (pathname.match(req.url)) {
        res.end(`Proxying to zone: ${zone.name} with url: ${zone.url}`)
      }
    }

    res.end('No dest found.')
  })
}
