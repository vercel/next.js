import { parseISO, format } from 'date-fns'

export default function Date({ dateString }) {
  const date = parseISO(dateString)
  return (
    <time dateTime={dateString} className="text-lg text-accent-5">
      {format(date, 'LLLL	d, yyyy')}
    </time>
  )
}
