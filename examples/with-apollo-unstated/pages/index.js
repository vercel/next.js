import Link from 'next/link'
import Head from 'next/head'
import { Fragment } from 'react'
import { Query } from 'react-apollo'
import { getUsdExchangeRate } from '../src/utils/operation'
import { Subscribe } from 'unstated'
import { dataContainer } from '../src/utils/unstated'
import ExchangeRateList from '../src/components/ExchangeRateList'

const Index = () => {
  return (
    <Subscribe to={[dataContainer]}>
      {(exchangeRate) => (
        <Fragment>
          <Head>
            <title>USD Exchange Rate</title>
            <meta
              name='viewport'
              content='initial-scale=1.0, width=device-width'
              key='viewport'
            />
          </Head>
          <Link href='about'>
            <button>go to About</button>
          </Link>
          <h1>USD To</h1>
          <Query notifyOnNetworkStatusChange query={getUsdExchangeRate}>
            {({ loading, error, data }) => {
              if (loading) return <p>Loading...</p>
              if (error) return <p>Error :(</p>

              return (
                <ExchangeRateList data={data} exchangeRate={exchangeRate} />
              )
            }}
          </Query>
        </Fragment>
      )}
    </Subscribe>
  )
}

export default Index
