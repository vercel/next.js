import { nextTestSetup } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'

describe('edge api can use async local storage', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const cases = [
    {
      title: 'a single instance',
      route: '/api/single',
      expectResponse: (response: any, id: string) =>
        expect(response).toMatchObject({ status: 200, json: { id } }),
    },
    {
      title: 'multiple instances',
      route: '/api/multiple',
      expectResponse: (response: any, id: string) =>
        expect(response).toMatchObject({
          status: 200,
          json: { id: id, nestedId: `nested-${id}` },
        }),
    },
  ]

  it.each(cases)(
    'can use $title per request',
    async ({ route, expectResponse }) => {
      const ids = Array.from({ length: 100 }, (_, i) => `req-${i}`)

      const responses = await Promise.all(
        ids.map((id) =>
          fetchViaHTTP(next.url, route, {}, { headers: { 'req-id': id } }).then(
            (response) =>
              response.headers
                .get('content-type')
                ?.startsWith('application/json')
                ? response.json().then((json) => ({
                    status: response.status,
                    json,
                    text: null,
                  }))
                : response.text().then((text) => ({
                    status: response.status,
                    json: null,
                    text,
                  }))
          )
        )
      )
      const rankById = new Map(ids.map((id, rank) => [id, rank]))

      const errors: Error[] = []
      for (const [rank, response] of responses.entries()) {
        try {
          expectResponse(response, ids[rank])
        } catch (error) {
          const received = response.json?.id
          console.log(
            `response #${rank} has id from request #${rankById.get(received)}`
          )
          errors.push(error as Error)
        }
      }
      if (errors.length) {
        throw errors[0]
      }
    }
  )
})
