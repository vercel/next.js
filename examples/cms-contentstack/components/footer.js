import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import parse from 'html-react-parser'
import Image from 'next/image'
import { onEntryChange } from '../sdk-plugin'
import { getFooterRes } from '../helper'

export default function Footer({ footer }) {
  const [getFooter, setFooter] = useState(footer)

  async function fetchData() {
    try {
      const footerRes = await getFooterRes()
      setFooter(footerRes)
    } catch (error) {
      console.error(error)
    }
  }

  useEffect(() => {
    onEntryChange(fetchData)
  }, [])

  return getFooter ? (
    <footer>
      <div className="max-width footer-div">
        <div className="col-quarter">
          <Link href="/" className="logo-tag">
            <a {...getFooter.logo.$?.url}>
              <Image
                height={26}
                width={130}
                layout="fixed"
                src={getFooter.logo.url}
                alt={getFooter.title}
                title={getFooter.title}
                className="logo footer-logo"
              />
            </a>
          </Link>
        </div>
        <div className="col-half">
          <nav>
            <ul className="nav-ul">
              {getFooter.navigation?.link.map((menu) => (
                <li
                  className="footer-nav-li"
                  key={menu.title}
                  {...menu.$?.title}
                >
                  <Link href={menu.href}>{menu.title}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="col-quarter social-link">
          <div className="social-nav">
            {getFooter.social?.social_share.map((social) => (
              <a
                {...social.link.$?.href}
                href={social.link.href}
                title={social.link.title}
                key={social.link.title}
              >
                {social.icon && (
                  <Image
                    {...social.icon.$?.url}
                    height={20}
                    width={20}
                    layout="fixed"
                    src={social.icon.url}
                    alt={social.link.title}
                  />
                )}
              </a>
            ))}
          </div>
        </div>
      </div>
      <div className="copyright" {...getFooter.$?.copyright}>
        {typeof getFooter.copyright === 'string' && parse(getFooter.copyright)}
      </div>
    </footer>
  ) : (
    ''
  )
}
