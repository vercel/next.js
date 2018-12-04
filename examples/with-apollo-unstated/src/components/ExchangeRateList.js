import { Fragment } from 'react'

const ExchangeRateList = (props) => {
  const { data, exchangeRate } = props

  return (
    <Fragment>
      {(exchangeRate && (
        <button
          onClick={() => {
            exchangeRate.insertData(data)
          }}
        >
          Update State!
        </button>
      )) || <h1>USD To</h1>}

      {(data.rates &&
        data.rates.map(({ currency, rate }) => (
          <Fragment key={currency}>
            <p>{`${currency}: ${rate}`}</p>
          </Fragment>
        ))) || (
        <Fragment>
          <p>you will see data after you update state in index</p>
        </Fragment>
      )}
    </Fragment>
  )
}

export default ExchangeRateList
