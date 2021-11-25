import sampleData2 from "../lib/sampleData2.json"
export default function refreshAuthToken(refreshToken){
    try {
      const aTIndex = process.env.ACCESS_TOKEN_INDEX_IN_SERVER_AUTH_JSON_RESPONSE
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
        const newAuthToken = sampleData2[aTIndex]
        return newAuthToken;
      } catch (error) {
        const { response: fetchResponse } = error
        res.status(fetchResponse?.status || 500).json(error.data)
      }
}