import { format } from 'date-fns'

export default function Date({ dateString }) {
  return (
    <time dateTime={dateString}>
      {format(new Date(dateString), 'LLLL	d, yyyy')}
    </time>
  )
}
