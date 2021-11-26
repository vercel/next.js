import fetchJson from "./fetchJson"
import sampleData2 from "../lib/sampleData2.json"
export default function refreshAuthToken(refreshToken){
    try {
        // Get new auth token, parameters may vary
        // const { newAuthToken } = await fetchJson(URL_TO_REFRESH_ACCESS_TOKEN, {
        //   method: 'POST',
        //   headers: {
        //      'Content-Type': 'application/json'
        //   },
        //   body: {
        //      refreshToken: refreshToken
        //   }
        // });
    
        // Comment below line after your implementation
        return sampleData2;
      } catch (error) {
        const { response: fetchResponse } = error
        res.status(fetchResponse?.status || 401).json(error.data)
      }
}