import React from "react";
import {
  setCookie,
  getCookies,
  getCookie,
  deleteCookie,
  hasCookie,
} from "cookies-next";

const Home = () => {
  const handleSetCookie = () => setCookie("client-cookie", "mock client value");
  const handleCheckCookie = () => console.log(hasCookie("client-cookie"));
  const handleGetCookie = () => console.log(getCookie("client-cookie"));
  const handleGetCookies = () => console.log(getCookies());
  const handleDeleteCookies = () => deleteCookie("client-cookie");

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
      <button onClick={handleDeleteCookies}>Remove Cookies</button>
    </div>
  );
};

export default Home;
