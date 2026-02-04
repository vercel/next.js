import fs from 'fs'
import eventStream from 'event-stream'
import {
  bold,
  blue,
  cyan,
  green,
  magenta,
  red,
  yellow,
} from '../packages/next/dist/lib/picocolors.js'

const file = fs.createReadStream(process.argv[2])

const sum = (...args) => args.reduce((a, b) => a + b, 0)

const aggregate = (event) => {
  const isBuildModule = event.name.startsWith('build-module-')
  event.range = event.timestamp + (event.duration || 0)
  event.total = isBuildModule ? event.duration : 0
  if (isBuildModule) {
    event.packageName = getPackageName(event.tags.name)
    if (event.children) {
      const queue = [...event.children]
      event.children = []
      event.childrenTimings = {}
      event.mergedChildren = 0
      for (const e of queue) {
        if (!e.name.startsWith('build-module-')) {
          event.childrenTimings[e.name] =
            (event.childrenTimings[e.name] || 0) + e.duration
          continue
        }
        const pkgName = getPackageName(e.tags.name)
        if (!event.packageName || pkgName !== event.packageName) {
          event.children.push(e)
        } else {
          event.duration += e.duration
          event.mergedChildren++
          if (e.children) queue.push(...e.children)
        }
      }
    }
  }
  if (event.children) {
    event.children.forEach(aggregate)
    event.children.sort((a, b) => a.timestamp - b.timestamp)
    event.range = Math.max(
      event.range,
      ...event.children.map((c) => c.range || event.timestamp)
    )
    event.total += isBuildModule
      ? sum(...event.children.map((c) => c.total || 0))
      : 0
  }
}

const formatDuration = (duration, isBold) => {
  const color = isBold ? bold : (x) => x
  if (duration < 1000) {
    return color(`${duration} µs`)
  } else if (duration < 10000) {
    return color(`${Math.round(duration / 100) / 10} ms`)
  } else if (duration < 100000) {
    return color(`${Math.round(duration / 1000)} ms`)
  } else if (duration < 1_000_000) {
    return color(cyan(`${Math.round(duration / 1000)} ms`))
  } else if (duration < 10_000_000) {
    return color(green(`${Math.round(duration / 100000) / 10} s`))
  } else if (duration < 20_000_000) {
    return color(yellow(`${Math.round(duration / 1000000)} s`))
  } else if (duration < 100_000_000) {
    return color(red(`${Math.round(duration / 1000000)} s`))
  } else {
    return color('🔥' + red(`${Math.round(duration / 1000000)} s`))
  }
}

const formatTimes = (event) => {
  const range = event.range - event.timestamp
  const additionalInfo = []
  if (event.total && event.total !== range)
    additionalInfo.push(`total ${formatDuration(event.total)}`)
  if (event.duration !== range)
    additionalInfo.push(`self ${formatDuration(event.duration, bold)}`)
  return `${formatDuration(range, additionalInfo.length === 0)}${
    additionalInfo.length ? ` (${additionalInfo.join(', ')})` : ''
  }`
}

const formatFilename = (filename) => {
  return cleanFilename(filename).replace(/.+[\\/]node_modules[\\/]/, '')
}

const cleanFilename = (filename) => {
  if (filename.includes('&absolutePagePath=')) {
    filename =
      'page ' +
      decodeURIComponent(
        filename.replace(/.+&absolutePagePath=/, '').slice(0, -1)
      )
  }
  filename = filename.replace(/.+!(?!$)/, '')
  return filename
}

const getPackageName = (filename) => {
  const match = /.+[\\/]node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/.exec(
    cleanFilename(filename)
  )
  return match && match[1]
}

const formatEvent = (event) => {
  let head
  switch (event.name) {
    case 'webpack-compilation':
      head = `${bold(`${event.tags.name} compilation`)} ${formatTimes(event)}`
      break
    case 'webpack-invalidated-client':
    case 'webpack-invalidated-server':
      head = `${bold(`${event.name.slice(-6)} recompilation`)} ${
        event.tags.trigger === 'manual'
          ? '(new page discovered)'
          : `(${formatFilename(event.tags.trigger)})`
      } ${formatTimes(event)}`
      break
    case 'add-entry':
      head = `${blue('entry')} ${formatFilename(event.tags.request)}`
      break
    case 'hot-reloader':
      head = `${bold(green(`hot reloader`))}`
      break
    case 'export-page':
      head = `${event.name} ${event.tags.path}  ${formatTimes(event)}`
      break
    default:
      if (event.name.startsWith('build-module-')) {
        const { mergedChildren, childrenTimings, packageName } = event
        head = `${magenta('module')} ${
          packageName
            ? `${bold(cyan(packageName))} (${formatFilename(event.tags.name)}${
                mergedChildren ? ` + ${mergedChildren}` : ''
              })`
            : formatFilename(event.tags.name)
        } ${formatTimes(event)}`
        if (childrenTimings && Object.keys(childrenTimings).length) {
          head += ` [${Object.keys(childrenTimings)
            .map((key) => `${key} ${formatDuration(childrenTimings[key])}`)
            .join(', ')}]`
        }
      } else {
        head = `${event.name} ${formatTimes(event)}`
      }
      break
  }
  if (event.children && event.children.length) {
    return head + '\n' + treeChildren(event.children.map(formatEvent))
  } else {
    return head
  }
}

const indentWith = (str, firstLinePrefix, otherLinesPrefix) => {
  return firstLinePrefix + str.replace(/\n/g, '\n' + otherLinesPrefix)
}

const treeChildren = (items) => {
  let str = ''
  for (let i = 0; i < items.length; i++) {
    if (i !== items.length - 1) {
      str += indentWith(items[i], '├─ ', '│  ') + '\n'
    } else {
      str += indentWith(items[i], '└─ ', '   ')
    }
  }
  return str
}

const tracesById = new Map()

file
  .pipe(eventStream.split())
  .pipe(
    eventStream.mapSync((data) => {
      if (!data) return
      const json = JSON.parse(data)
      json.forEach((event) => {
        tracesById.set(event.id, event)
      })
    })
  )
  .on('end', () => {
    const rootEvents = []
    for (const event of tracesById.values()) {
      if (event.parentId) {
        event.parent = tracesById.get(event.parentId)
        if (event.parent) {
          if (!event.parent.children) event.parent.children = []
          event.parent.children.push(event)
        }
      }
      if (!event.parent) rootEvents.push(event)
    }
    for (const event of rootEvents) {
      aggregate(event)
    }
    console.log(`Explanation:
${formatEvent({
  name: 'build-module-js',
  tags: { name: '/Users/next-user/src/magic-ui/pages/index.js' },
  duration: 163000,
  timestamp: 0,
  range: 24000000,
  total: 33000000,
  childrenTimings: { 'read-resource': 873, 'next-babel-turbo-loader': 135000 },
})}
       ════════╤═══════════════════════════════════ ═╤═        ═╤═       ═╤════   ═══════════╤════════════════════════════════════════
               └─ name of the processed module       │          │         │                  └─ timings of nested steps
                                                     │          │         └─ building the module itself (including overlapping parallel actions)
                                                     │          └─ total build time of this modules and all nested ones (including overlapping parallel actions)
                                                     └─ how long until the module and all nested modules took compiling (wall time, without overlapping actions)

${formatEvent({
  name: 'build-module-js',
  tags: {
    name: '/Users/next-user/src/magic-ui/node_modules/lodash/camelCase.js',
  },
  packageName: 'lodash',
  duration: 958000,
  timestamp: 0,
  range: 295000,
  childrenTimings: { 'read-resource': 936000 },
  mergedChildren: 281,
})}
       ═╤════  ══════╤════════════   ═╤═
        │            │                └─ number of modules that are merged into that line
        │            └─ first module that is imported
        └─ npm package name

`)
    for (const event of rootEvents) {
      console.log(formatEvent(event))
    }
  })
