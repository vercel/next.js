import jwt from "jsonwebtoken"
export default function refreshToken(refreshToken){
    try {
        // Get new auth token, parameters may vary
        // const { authToken } = await fetchJson(URL_TO_REFRESH_ACCESS_TOKEN, {
        //   method: 'POST',
        //   headers: {
        //      'Content-Type': 'application/json'
        //   },
        //   body: {
        //      refreshToken: refreshToken
        //   }
        // });
    
        // Comment below line after your implementation
        const { authToken } = sampleData2
        
        const user = { isLoggedIn: true, login, authToken, refreshToken }
        req.session.set('user', user)
        await req.session.save()
        res.json(user)
      } catch (error) {
        const { response: fetchResponse } = error
        res.status(fetchResponse?.status || 500).json(error.data)
      }
}