import { format, parseISO } from 'date-fns'

type Props = {
  dateString: string
}

export const DateFormatter = ({ dateString }: Props) => {
  if (!dateString) return <></>
  const date = parseISO(dateString)

  return <time dateTime={dateString}>{format(date, 'LLL d, yyyy')}</time>
}
