export function formatRelativeTime(pastDate) {
  const relativeTime = new Intl.RelativeTimeFormat('en', { style: 'narrow' })
  const diff = new Date(pastDate) - new Date()
  let rt = Math.ceil(diff / 1e3)
  let unit = 'second'

  const minutes = Math.ceil(diff / 6e4)
  if (minutes !== 0 && minutes > rt) {
    rt = minutes
    unit = 'minute'
  }

  const hours = Math.ceil(diff / 3.6e6)
  if (hours !== 0 && hours > rt) {
    rt = hours
    unit = 'hour'
  }

  const days = Math.ceil(diff / 8.64e7)
  if (days !== 0 && days > rt) {
    rt = days
    unit = 'day'
  }

  const weeks = Math.ceil(diff / 6.048e8)
  if (weeks !== 0 && weeks > rt) {
    rt = weeks
    unit = 'week'
  }

  const months = Math.ceil(diff / 2.628e9)
  if (months !== 0 && months > rt) {
    rt = months
    unit = 'month'
  }

  const years = Math.ceil(months / 12)
  if (years !== 0 && years > rt) {
    rt = years
    unit = 'year'
  }

  return relativeTime.format(rt, unit)
}
