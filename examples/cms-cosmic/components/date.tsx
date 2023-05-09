import { parseISO, format } from 'date-fns'

type DateProps = {
  dateString: string
}

const Date = (props: DateProps) => {
  const { dateString } = props
  const date = parseISO(dateString)
  return <time dateTime={dateString}>{format(date, 'LLLL	d, yyyy')}</time>
}

export default Date
