import React from 'react'
import Index from '../pages'
import renderer from 'react-test-renderer'
import { MockedProvider } from '@apollo/client/testing'
import gql from 'graphql-tag'

function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const mocks: any = [
  {
    request: {
      query: gql`
        query Viewer {
          viewer {
            ...Partial
            status
          }
        }

        fragment Partial on User {
          id
          name
        }
      `,
      variables: {},
    },
    result: {
      data: {
        viewer: {
          id: 'Baa',
          name: 'Baa',
          status: 'Healthy',
        },
      },
    },
  },
]

describe('Index', () => {
  it('renders the html we want', async () => {
    const component = renderer.create(
      <MockedProvider mocks={mocks} addTypename={false}>
        <Index />
      </MockedProvider>
    )
    expect(component.toJSON()).toMatchSnapshot('loading')
    // Wait for state change of data loading
    await renderer.act(() => timeout(0))
    expect(component.toJSON()).toMatchSnapshot('loaded')
  })
})
