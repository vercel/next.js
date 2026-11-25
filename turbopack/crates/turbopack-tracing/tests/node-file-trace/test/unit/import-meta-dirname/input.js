import { readFileSync } from 'fs'
import path, { dirname, join } from 'path'

readFileSync(join(import.meta.dirname, 'asset-join.txt'))
readFileSync(path.resolve(import.meta.dirname, 'asset-resolve.txt'))
readFileSync(join(dirname(import.meta.filename), 'asset-filename.txt'))
readFileSync(`${import.meta.dirname}/asset-tpl.txt`)
readFileSync(import.meta['dirname'] + '/asset-computed.txt')
