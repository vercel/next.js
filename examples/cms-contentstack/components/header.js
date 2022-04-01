import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import parse from 'html-react-parser'
import Tooltip from './tool-tip'
import Image from 'next/image'
import { onEntryChange } from '../sdk-plugin/index'
import { getHeaderRes } from '../helper/index'

export default function Header({ header }) {
  const router = useRouter()

  const [getHeader, setHeader] = useState(header)

  async function fetchData() {
    try {
      const headerRes = await getHeaderRes()
      setHeader(headerRes)
    } catch (error) {
      console.error(error)
    }
  }

  useEffect(() => {
    onEntryChange(fetchData)
  }, [])

  return getHeader ? (
    <header className="header">
      <div className="note-div">
        {getHeader?.notification_bar.show_announcement
          ? typeof getHeader.notification_bar.announcement_text ===
              'string' && (
              <div {...getHeader.notification_bar.$?.announcement_text}>
                {parse(getHeader.notification_bar.announcement_text)}
              </div>
            )
          : null}
      </div>
      <div className="max-width header-div">
        <div className="wrapper-logo">
          <Link href="/" className="logo-tag" title="Contentstack">
            <div className="logo" {...getHeader.logo.$?.url}>
              <Image
                height={26}
                width={130}
                layout="fixed"
                src={getHeader.logo.url}
                alt={getHeader.title}
                title={getHeader.title}
              />
            </div>
          </Link>
        </div>
        <input className="menu-btn" type="checkbox" id="menu-btn" />
        <label className="menu-icon" htmlFor="menu-btn">
          <span className="navicon" />
        </label>
        <nav className="menu">
          <ul className="nav-ul header-ul">
            {getHeader.navigation_menu?.map((list) => (
              <li key={list.label} className="nav-li">
                <Link href={list.page_reference[0].url}>
                  <a
                    {...list.$?.label}
                    className={
                      router.pathname === list.page_reference[0].url
                        ? 'active'
                        : ''
                    }
                  >
                    {list.label}
                  </a>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="json-preview">
          <Tooltip content="JSON Preview" direction="top">
            <span data-bs-toggle="modal" data-bs-target="#staticBackdrop">
              <Image
                height={16}
                width={16}
                layout="fixed"
                src="/json.svg"
                alt="JSON Preview icon"
              />
            </span>
          </Tooltip>
        </div>
      </div>
    </header>
  ) : (
    ''
  )
}
