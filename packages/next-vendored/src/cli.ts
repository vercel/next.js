#!/usr/bin/env node

import arg from 'arg'
import path from 'node:path'
import { type TaskFile, Task } from './task.js'

const args = arg({
  '--file': String,
})
const filePath = args['--file'] || 'taskfile.js'
const taskNames = args._

if (!taskNames.length) {
  console.log('Missing a task name to execute')
  process.exit(1)
}

const taskfilePath = path.join(process.cwd(), filePath)
const {
  tasks,
  Task: CustomTask,
  ...exportedTasks
} = (await import(taskfilePath)) as TaskFile
const task = new Task({
  tasks: { ...tasks, ...exportedTasks },
  Task: CustomTask,
})

await task.parallel(taskNames)
