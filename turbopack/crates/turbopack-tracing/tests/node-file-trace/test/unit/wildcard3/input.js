const path = require('path')

const num = Math.ceil(Math.random() * 3)

fs.readFileSync(path.join(__dirname, 'assets', 'asset') + num + '.txt')
