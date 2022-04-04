import React from 'react'
import Header from './header'
import Footer from './footer'
import DevTools from './devtools'

export default function Layout({
  header,
  footer,
  page,
  blogPost,
  blogList,
  children,
}) {
  const jsonObj = { header, footer }
  page && (jsonObj.page = page)
  blogPost && (jsonObj.blog_post = blogPost)
  blogList && (jsonObj.blog_list = blogList)

  return (
    <>
      {header ? <Header header={header} /> : ''}
      <main className="mainClass">
        {children}
        {Object.keys(jsonObj).length && <DevTools response={jsonObj} />}
      </main>
      {footer ? <Footer footer={footer} /> : ''}
    </>
  )
}
