import { NavBar, Icon, WingBlank } from 'antd-mobile'
import Router from 'next/router'
import Head from 'next/head'

export default function Layout({ children, title }) {
  return (
    <div>
      <Head>
        <title>{title}</title>
      </Head>
      <NavBar
        mode="light"
        icon={<Icon type="left" />}
        onLeftClick={() => Router.back()}
      >
        Ant Design Mobile example
      </NavBar>
      <h1>{title}</h1>
      <style jsx>{`
        h1 {
          padding: 15px 0 9px 15px;
          color: #000;
          font-size: 16px;
          line-height: 16px;
          height: 16px;
          font-weight: bolder;
          position: relative;
        }
      `}</style>
      <WingBlank>{children}</WingBlank>
    </div>
  )
}
