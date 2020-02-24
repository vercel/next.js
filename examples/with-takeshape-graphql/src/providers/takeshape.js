import fetch from 'isomorphic-fetch'
import { getImageUrl, formatPath } from 'takeshape-routing'

export const TAKESHAPE_PROJECT = process.env.TAKESHAPE_PROJECT

export class Client {
  constructor(projectId, apiKey) {
    this.token = apiKey
    this.endpoint = `https://api.takeshape.io/project/${projectId}/graphql`
    this.getImageUrl = getImageUrl
    this.formatPath = formatPath
  }
  async graphql(params) {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(params),
    })
    return res
  }
}

export default new Client(TAKESHAPE_PROJECT, process.env.TAKESHAPE_API_KEY)
