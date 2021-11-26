import fetchJson from "./fetchJson"
import sampleData from "./sampleData.json"
export default function authentication(username,password) {
    try {
    // Uncomment below lines for your real world implementation
    // const data = await fetchJson(URL_TO_AUTHENTICATE_AND_GET_LOGIN_DATA, {
    //     method: 'POST',
    //     headers: {
    //         'Content-Type': 'application/json'
    //     },
    //     body: {
    //         username,
    //         password
    //     }
    // });
    // return data;

    // Comment below line after your implementation
    return sampleData;
    } catch (error) {
        const { response: fetchResponse } = error
        res.status(fetchResponse?.status || 401).json(error.data)
    }
}