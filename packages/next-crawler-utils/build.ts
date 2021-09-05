import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import crawlers from 'crawler-user-agents'

const license = readFileSync(
  join(dirname(require.resolve('crawler-user-agents')), 'LICENSE')
).toString()
const pattern = crawlers.map((crawler) => crawler.pattern).join('|')

process.stdout.write(
  `
  /*
  ${license}
  */
  export const CRAWLER_PATTERN = /${pattern}/`
)
