import fs from 'fs'
console.log(fs.readFileSync(new URL('./asset.txt', import.meta.url)))
