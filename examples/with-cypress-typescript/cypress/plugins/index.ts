import _ from 'lodash'
import Promise from 'bluebird'
import axios from 'axios'

export default (on: any, config: any) => {
  const queryApi = ({ entity, query }, callback) => {
    const fetchData = async (attrs) => {
      const { data } = await axios.get(`${config.env.apiUrl}/${entity}`)
      return callback(data, attrs)
    }

    return Array.isArray(query)
      ? Promise.map(query, fetchData)
      : fetchData(query)
  }

  on('task', {
    'filter:api'(queryPayload) {
      return queryApi(queryPayload, (data, attrs) =>
        _.filter(data.results, attrs)
      )
    },
    'find:api'(queryPayload) {
      return queryApi(queryPayload, (data, attrs) =>
        _.find(data.results, attrs)
      )
    },
  })

  return config
}
