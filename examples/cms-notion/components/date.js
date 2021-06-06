import { format } from 'date-fns'
// import { Date as PrismicDate } from 'prismic-reactjs'

export default function Date({ dateString }) {
  // const date = PrismicDate(dateString)
  return <time dateTime={dateString}>{dateString}</time>
}
