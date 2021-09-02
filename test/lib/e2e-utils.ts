import { NextConfig } from 'next'
import { NextInstance } from './next-modes/base'
import { NextDevInstance } from './next-modes/next-dev'
import { NextStartInstance } from './next-modes/next-start'

/**
 * FileRef is wrapper around a file path that is meant be copied
 * to the location where the next instance is being created
 */
export class FileRef {
  public fsPath: string

  constructor(path: string) {
    this.fsPath = path
  }
}

let nextInstance: NextInstance | undefined = undefined

export async function createNext(opts: {
  files: {
    [filename: string]: string | FileRef
  }
  dependencies?: {
    [name: string]: string
  }
  nextConfig?: NextConfig
}): Promise<NextInstance> {
  const testMode = process.env.NEXT_TEST_MODE

  if (nextInstance) {
    throw new Error(`createNext called without destroying previous instance`)
  }

  if (testMode === 'dev') {
    // next dev
    nextInstance = new NextDevInstance(opts)
  } else if (testMode === 'deploy') {
    // Vercel
  } else {
    // next build + next start
    nextInstance = new NextStartInstance(opts)
  }

  return nextInstance!
}
