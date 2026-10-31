//this line uses typescript specific syntax
//to demonstrate that transpilation occurs
export type API = () => string
const api: API = () => 'Hello from a'
export default api
