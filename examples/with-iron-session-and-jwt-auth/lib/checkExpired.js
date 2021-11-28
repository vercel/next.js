import jwt from "jsonwebtoken"
export default function checkExpired(accessToken) {
    const expIndex = process.env.EXPIRES_AT_INDEX_IN_TOKEN
    const decodedToken = jwt.decode(accessToken)
    /*  
        Expiry time is in seconds with our example data, 
        we need milliseconds (might be different in other implementations) so we do *1000
    */
    const expiresAt = new Date((decodedToken[expIndex]) * 1000)
    const now = new Date()
    if (now < expiresAt) {
        //  Not expired
        return false;
    } else {
        //  Expired
        return true;
    }
}