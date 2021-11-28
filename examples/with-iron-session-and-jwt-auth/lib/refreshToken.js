import fetchJson from "./fetchJson"
import sampleData2 from "../lib/sampleData2.json"
export default async function refreshAuthToken(refreshToken) {
  // Get new auth token, parameters may vary
  // const { newAuthToken } = await fetchJson(URL_TO_REFRESH_ACCESS_TOKEN, {
  //   method: 'POST',
  //   headers: {
  //      'Content-Type': 'application/json'
  //   },
  //   body: JSON.stringify({
  //            refreshToken: refreshToken
  //         })
  // });
  // Comment below line after your implementation
  return sampleData2;
}