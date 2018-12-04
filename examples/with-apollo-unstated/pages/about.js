import { Fragment } from 'react'
import Link from 'next/link'
import { DataContainer } from '../src/utils/unstated'
import { Subscribe } from 'unstated'
import ExchangeRateList from '../src/components/ExchangeRateList'
const about = () => {
  return (
    <Subscribe to={[DataContainer]}>
      {(exchangeRate) => {
        return (
          <Fragment>
            <Link href='./index'>
              <button>go to Index</button>
            </Link>
            <ExchangeRateList data={exchangeRate.getData()} />
          </Fragment>
        )
      }}
    </Subscribe>
  )
}

export default about
