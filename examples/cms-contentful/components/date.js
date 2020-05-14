import { format } from 'date-fns'

export default ({ dateString }) => (
  <time dateTime={dateString}>
    {format(new Date(dateString), 'LLLL	d, yyyy')}
  </time>
)
