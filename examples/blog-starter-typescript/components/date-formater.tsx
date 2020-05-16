import React from 'react'
import { parseISO, format } from 'date-fns'

type Props = {
  dateString: string
}

const DateFormater: React.FC<Props> = ({ dateString }) => {
  const date = parseISO(dateString)
  return <time dateTime={dateString}>{format(date, 'LLLL	d, yyyy')}</time>
}

export default DateFormater
