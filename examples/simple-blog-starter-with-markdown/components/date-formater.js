import { parseISO, format } from 'date-fns'

export default function DateFormater({ dateString, strFormat }) {
  const date = parseISO(dateString)
  return <time dateTime={dateString}>{format(date, strFormat)}</time>
}
