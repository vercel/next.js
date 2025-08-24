import { server } from './server.mjs'

const port = 3000
server.listen(3000, () => {
  console.log(`Server running at http://localhost:${port}/`)
})
