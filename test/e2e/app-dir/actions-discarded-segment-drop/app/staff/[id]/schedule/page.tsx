import { scheduleLoad } from '../../../actions'
import { ScheduleManager } from './ScheduleManager'

export const dynamic = 'force-dynamic'

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await scheduleLoad(400)
  await Promise.all([scheduleLoad(800), scheduleLoad(800), scheduleLoad(800)])
  return <ScheduleManager staffId={id} />
}
