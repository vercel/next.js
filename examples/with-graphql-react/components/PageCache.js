import ErrorMessageLoading from './ErrorMessageLoading'

export default function PageCache({
  cacheValue: { errors, data } = {},
  renderData,
}) {
  return errors ? (
    <ErrorMessageLoading />
  ) : data ? (
    renderData(data)
  ) : (
    <p>Loading…</p>
  )
}
