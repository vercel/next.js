import formatDistanceToNowStrict from 'date-fns/formatDistanceToNowStrict'

export default function distanceToNow(dateTime) {
  return formatDistanceToNowStrict(dateTime, {
    addSuffix: true,
  })
}
