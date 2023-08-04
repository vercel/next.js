import request from 'supertest'
import { expressServer } from '../../../../src/index'

describe('User Query', () => {
  describe('usersConnection', () => {
    let res: request.Response
    beforeEach(async () => {
      res = await request(expressServer)
        .post('/graphql')
        .send({
          query: `query {
                    userConnection(first: 10) {
                      totalCount
                      edges {
                        cursor
                        node {
                          id
                        }
                      }
                      nodes {
                        id
                      }
                      pageInfo {
                        startCursor
                        endCursor
                        hasNextPage
                      }
                    }
                  }`,
        })
    })
    it('successfully respond 200', () => {
      expect(res.status).toBe(200)
    })
  })
})
