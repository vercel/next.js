const app = require('./server')
const port = 3000

console.log(app)
app.listen(port)
console.log(`listening on http://localhost:${port}`)
