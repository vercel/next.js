import React from 'react'
import { getCookies, getCookie, setCookies, removeCookies } from 'cookies-next'

const SsrCookies = () => {
  return <div>SSR Cookies</div>
}

export const getServerSideProps = ({ req, res }) => {
  setCookies('ssr-cookie', 'mock-ssr-value', { req, res, maxAge: 60 * 6 * 24 })
  getCookie('client-cookie', { req, res })
  getCookies({ req, res })
  removeCookies('client-cookie', { req, res })
  return { props: {} }
}

export default SsrCookies
