import fs from 'node:fs/promises'
import { Task as CoreTask } from './task.js'

export class Task extends CoreTask {
  async clear(path: string) {
    await fs.rm(path, { recursive: true, force: true })
  }
}
