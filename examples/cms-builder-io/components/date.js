import { format } from 'date-fns'

export default function DateComponent({ dateString }) {
  return (
    <time dateTime={new Date(dateString)}>
      {format(new Date(dateString), 'LLLL	d, yyyy')}
    </time>
  )
}
