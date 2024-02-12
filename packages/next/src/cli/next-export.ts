#!/usr/bin/env node
import { cyan } from '../lib/picocolors'
import * as Log from '../build/output/log'
import type { CliCommand } from '../lib/commands'

const nextExport: CliCommand = () => {
  Log.error(`
    The "next export" command has been removed in favor of "output: export" in next.config.js. Learn more: ${cyan(
      'https://nextjs.org/docs/advanced-features/static-html-export'
    )}
  `)
  process.exit(1)
}

export { nextExport }
