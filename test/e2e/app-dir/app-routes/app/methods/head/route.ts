// This route only exports GET, and not HEAD. The test verifies that a request
// via HEAD will be the same as GET but without the response body.
export { GET } from '../../../handlers/hello'
