import fetchJson from "./fetchJson"
import sampleData from "./sampleData.json"
export default async function authentication(username, password) {
    // Uncomment below lines for your real world implementation
    // const data = await fetchJson(URL_TO_AUTHENTICATE_AND_GET_LOGIN_DATA, {
    //     method: 'POST',
    //     headers: {
    //         'Content-Type': 'application/json'
    //     },
    //     body: JSON.stringify({
    //              username,
    //              password
    //           })
    // });
    // return data;
    
    // Comment below line after your implementation
    return sampleData;
}