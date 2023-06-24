import { toFormat, type Dinero } from 'dinero.js'

export const ProductCurrencySymbol = ({
  dinero,
}: {
  dinero: Dinero<number>
}) => {
  let symbol = ''
  switch (toFormat(dinero, ({ currency }) => currency.code)) {
    case 'GBP': {
      symbol = '£'
      break
    }

    case 'EUR': {
      symbol = '€'
      break
    }

    default: {
      symbol = '$'
      break
    }
  }

  return <>{symbol}</>
}
