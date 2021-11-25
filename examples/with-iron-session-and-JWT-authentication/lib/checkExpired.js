import jwt from "jsonwebtoken"
export default function checkExpired(accessToken) {
    const decodedToken = jwt.decode(accessToken)
    /*  
        Expiry time is in seconds with our example data, we need miliseconds (might be different in other implementaions) so we do *1000
        Expiry keyword (exp here) might be different in other servers as well, watch out both!
    */
    const exp = new Date((decodedToken.exp) * 1000)
    const now = new Date()
    if (now < exp) {
        //  Not expired
        return false;
    } else {
        //  Expired
        return true;
    }
}