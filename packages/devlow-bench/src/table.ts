import { readFile } from 'fs/promises'
import minimist from 'minimist'
;(async () => {
  const args = minimist(process.argv.slice(2), {
    alias: {
      r: 'row',
      c: 'column',
      '?': 'help',
      h: 'help',
    },
  })

  const knownArgs = new Set(['row', 'r', 'column', 'c', 'help', 'h', '?', '_'])
  if (args.help || (Object.keys(args).length === 1 && args._.length === 0)) {
    console.log('Usage: devlow-table <data.json>')
    console.log('  --row=<name>      Key to show as row')
    console.log('  --column=<name>   Key to show as column')
    console.log('  --<prop>=<name>   Filter values')
    console.log('  --help, -h, -?    Show this help')
  }

  let data = JSON.parse(await readFile(args._[0], 'utf-8')) as any[]

  const getValue = (
    entry: any,
    name: string | string[],
    includeKey: boolean
  ): string => {
    if (name === 'value') {
      return entry.text as string
    }
    if (Array.isArray(name)) {
      return name
        .map((n) => getValue(entry, n, true))
        .filter((x) => x)
        .join(' ')
    }
    const value = entry.key[name]
    if (value === undefined) return ''
    if (value === true) return includeKey ? name : 'true'
    if (value === false) return includeKey ? '' : 'false'
    if (value === null) return ''
    if (includeKey) return `${name}=${value}`
    return value + ''
  }

  for (const [key, value] of Object.entries(args)) {
    if (knownArgs.has(key)) continue
    const values = (Array.isArray(value) ? value : [value]).map((v) =>
      v.toString()
    )
    data = data.filter((item) => {
      const itemValue = getValue(item, key, false)
      if (itemValue === '') return false
      return values.some((v) => itemValue === v)
    })
  }

  if (data.length === 0) {
    console.log('No data')
    return
  }

  const rowKey = args.row || 'name'
  const columnKey = args.column || 'scenario'
  const getRow = (entry: any) => getValue(entry, rowKey, false)
  const getColumn = (entry: any) => getValue(entry, columnKey, false)

  const allRows = new Set(data.map(getRow))
  const allColumns = new Set(data.map(getColumn))

  const table = []
  const columnSizes = [...allColumns].map((c) => c.length)
  for (const row of allRows) {
    const rowData: string[] = []
    let i = 0
    for (const column of allColumns) {
      let items = data
        .filter((d: any) => getRow(d) === row && getColumn(d) === column)
        .map((item) => item.text)
      rowData.push(items.join(', '))
      columnSizes[i] = Math.max(columnSizes[i], rowData[i].length)
      i++
    }
    table.push(rowData)
  }

  const pad = (str: string, size: number) => {
    return ' '.repeat(size - str.length) + str
  }

  const firstColumnSize = Math.max(...[...allRows].map((r) => r.length))

  // Header
  {
    let line = '| '
    let sepLine = '|:'
    line += ' '.repeat(firstColumnSize)
    sepLine += '-'.repeat(firstColumnSize)
    const allColumnsArray = [...allColumns]
    for (let i = 0; i < columnSizes.length; i++) {
      line += ' | '
      line += pad(allColumnsArray[i], columnSizes[i])
      sepLine += ':|-'
      sepLine += '-'.repeat(columnSizes[i])
    }
    line += ' |'
    sepLine += ':|'
    console.log(line)
    console.log(sepLine)
  }

  // Separator
  let r = 0
  for (const rowName of allRows) {
    let line = '| '
    line += pad(rowName, firstColumnSize)
    for (let i = 0; i < columnSizes.length; i++) {
      line += ' | '
      line += pad(table[r][i], columnSizes[i])
    }
    line += ' |'
    console.log(line)
    r++
  }
})().catch((e) => {
  console.error(e.stack)
})
