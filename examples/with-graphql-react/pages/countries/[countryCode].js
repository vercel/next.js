import useAutoLoad from 'graphql-react/public/useAutoLoad.js'
import useCacheEntry from 'graphql-react/public/useCacheEntry.js'
import useWaterfallLoad from 'graphql-react/public/useWaterfallLoad.js'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useCallback } from 'react'
import ErrorMessageMissing from '../../components/ErrorMessageMissing'
import PageCache from '../../components/PageCache'
import useLoadCountriesApi from '../../hooks/useLoadCountriesApi'

const query = /* GraphQL */ `
  query($countryCode: ID!) {
    country(code: $countryCode) {
      name
      emoji
      capital
    }
  }
`

export default function CountryPage() {
  const {
    query: { countryCode },
  } = useRouter()
  const cacheKey = `CountryPage-${countryCode}`
  const cacheValue = useCacheEntry(cacheKey)
  const loadCountriesApi = useLoadCountriesApi()
  const load = useCallback(
    () =>
      loadCountriesApi(cacheKey, {
        query,
        variables: {
          countryCode,
        },
      }),
    [cacheKey, countryCode, loadCountriesApi]
  )

  useAutoLoad(cacheKey, load)

  const isWaterfallLoading = useWaterfallLoad(cacheKey, load)

  return isWaterfallLoading ? null : (
    <>
      <Head>
        <title>Country</title>
      </Head>
      <PageCache
        cacheValue={cacheValue}
        renderData={(data) =>
          data.country ? (
            <article>
              <Head>
                <title>{data.country.name}</title>
                <meta
                  name="description"
                  content={`Information about the country ${data.country.name}.`}
                />
              </Head>
              <h1>{data.country.name}</h1>
              <table>
                <tbody>
                  <tr>
                    <th scope="row">Flag</th>
                    <td>{data.country.emoji}</td>
                  </tr>
                  <tr>
                    <th scope="row">Capital</th>
                    <td>{data.country.capital}</td>
                  </tr>
                </tbody>
              </table>
            </article>
          ) : (
            <ErrorMessageMissing />
          )
        }
      />
    </>
  )
}
