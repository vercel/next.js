import jwt from "jsonwebtoken"
import sampleData2 from "../lib/sampleData2.json"
export default function refreshAuthToken(refToken){
    try {
        const accessToken = process.env.ACCESS_TOKEN_INDEX_IN_SERVER_JSON_RESPONSE
        const refreshToken = process.env.REFRESH_TOKEN_INDEX_IN_SERVER_JSON_RESPONSE
        // Get new auth token, parameters may vary
        // const { authToken } = await fetchJson(URL_TO_REFRESH_ACCESS_TOKEN, {
        //   method: 'POST',
        //   headers: {
        //      'Content-Type': 'application/json'
        //   },
        //   body: {
        //      [refreshToken]: refToken
        //   }
        // });
    
        // Comment below line after your implementation
        const { authToken } = sampleData2
        
        const user = { isLoggedIn: true, login, [accessToken]:authToken, [refreshToken]:refToken }
        req.session.set('user', user)
        await req.session.save()
        res.json(user)
      } catch (error) {
        const { response: fetchResponse } = error
        res.status(fetchResponse?.status || 500).json(error.data)
      }
}