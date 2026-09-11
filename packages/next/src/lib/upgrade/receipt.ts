import { bold, cyan, dim } from '../picocolors'

export function printUpgradeReceipt(options: {
  agent: string
  session: string
  open: string | null
  logs: string
  stop: string
  errors: string | null
  resume: string | null
  exited: boolean
}) {
  console.log(
    `  ${bold(options.agent)} ${options.exited ? 'exited' : 'running in background'} ${dim('·')} ${cyan(options.session)}\n`
  )
  const rows = [
    ...(options.open ? [['Open', options.open]] : []),
    ['Logs', options.logs],
    ...(options.errors ? [['Errors', options.errors]] : []),
    ['Stop', options.stop],
    ...(options.resume ? [['Resume later', options.resume]] : []),
  ]
  const width = Math.max(...rows.map(([label]) => label.length))

  for (const [label, value] of rows) {
    console.log(`  ${dim(label.padEnd(width))}  ${value}`)
  }

  if (options.resume) {
    console.log(
      `\n  ${dim('Resume only after the background process finishes.')}`
    )
  }

  console.log()
}
