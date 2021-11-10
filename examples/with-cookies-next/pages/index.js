import { setCookies, getCookies, getCookie, removeCookies, checkCookies } from 'cookies-next'

const Home = () => {
  const handleSetCookie = () => setCookies('client-cookie', 'mock client value');
  const handleCheckCookie = () => console.log(checkCookies('client-cookie'));
  const handleGetCookie = () => console.log(getCookie('client-cookie'));
  const handleGetCookies = () => console.log(getCookies());
  const handleRemoveCookies = () => removeCookies('client-cookie');

  return (
    <div>
      <h1>Next Cookies</h1>

      <button onClick={handleSetCookie}>Set Cookie</button>
      <br />
      <button onClick={handleCheckCookie}>Check Cookie</button>
      <br />
      <button onClick={handleGetCookie}>Get Cookie</button>
      <br />
      <button onClick={handleGetCookies}>Get All Cookies</button>
      <br />
      <button onClick={handleRemoveCookies}>Remove Cookies</button>
    </div>
  )
}

export default Home
