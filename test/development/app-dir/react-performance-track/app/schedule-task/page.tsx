import { scheduleTask } from 'next/dist/server/app-render/sequential-tasks.external'

function waitForScheduleTask() {
  return new Promise<void>((resolve) => {
    scheduleTask(() => {
      resolve()
    })
  })
}

async function abstraction() {
  await waitForScheduleTask()
}

export default async function MessagePortPage() {
  await abstraction()
  await waitForScheduleTask()

  return <p>Done</p>
}
