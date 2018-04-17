const sm = require('sitemap')
const path = require('path')
const posts = require('./posts')

const sitemap = sm.createSitemap({
  hostname: 'https://sitemap-robots.now.sh',
  cacheTime: 600000 // 600 sec - cache purge period
})

const setup = ({ server }) => {
  const Posts = posts()
  for (let i = 0; i < Posts.length; i += 1) {
    const post = Posts[i]
    sitemap.add({
      url: `/posts/${post.slug}`,
      changefreq: 'daily',
      priority: 0.9
    })
  }

  sitemap.add({
    url: '/a',
    changefreq: 'daily',
    priority: 1
  })

  sitemap.add({
    url: '/b',
    changefreq: 'daily',
    priority: 1
  })

  server.get('/sitemap.xml', (req, res) => {
    sitemap.toXML((err, xml) => {
      if (err) {
        res.status(500).end()
        return
      }

      res.header('Content-Type', 'application/xml')
      res.send(xml)
    })
  })

  server.get('/robots.txt', (req, res) => {
    res.sendFile(path.join(__dirname, '../static', 'robots.txt'))
  })
}

module.exports = setup
