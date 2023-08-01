import { add, format, isTomorrow } from 'date-fns'

export const ProductEstimatedArrival = ({
  leadTime,
  hasDeliveryTime = false,
}: {
  leadTime: number
  hasDeliveryTime?: boolean
}) => {
  const date = add(new Date(), {
    days: leadTime,
  })

  return (
    <div className="text-sm text-gray-300">
      Get it{' '}
      <strong className="font-bold text-gray-100">
        {isTomorrow(date) ? 'tomorrow, ' : null}
        {format(date, 'MMM d')}
      </strong>
      {hasDeliveryTime ? <> by 5pm</> : null}
    </div>
  )
}
