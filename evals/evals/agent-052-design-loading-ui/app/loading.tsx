import { Spinner } from './Spinner'

export default function Loading() {
  return (
    <div className="route-loading">
      <Spinner label="Loading..." />
    </div>
  )
}
