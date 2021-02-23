import Head from 'next/head'
import { ToastContainer, toast } from 'react-toastify'
import React, { useState, useEffect, useRef } from 'react'

function Home() {
  const inputNewFeature = useRef()
  const inputEmail = useRef()
  const logo = process.env.LOGO ? process.env.LOGO : '/logo.png'
  const [loaded, setLoaded] = useState(false)
  const [items, setItems] = useState([])

  useEffect(() => {
    refreshData()
  }, [])

  const refreshData = () => {
    fetch('api/list')
      .then((res) => res.json())
      .then(
        (result) => {
          setItems(result.body)
          setLoaded(true)
          inputNewFeature.current.value = ''
        },
        (error) => {
          setLoaded(true)
        }
      )
  }

  const vote = (event, title) => {
    const requestOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title }),
    }
    fetch('api/vote', requestOptions)
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          toast.error(data.error, { hideProgressBar: true, autoClose: 3000 })
        } else {
          refreshData()
        }
      })
  }

  const handleNewFeature = (event) => {
    const requestOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: inputNewFeature.current.value }),
    }
    fetch('api/create', requestOptions)
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          toast.error(data.error, { hideProgressBar: true, autoClose: 5000 })
        } else {
          toast.info('Your feature has been added to the list.', {
            hideProgressBar: true,
            autoClose: 3000,
          })
          refreshData()
        }
      })
    event.preventDefault()
  }

  const handleNewEmail = (event) => {
    const requestOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inputEmail.current.value }),
    }
    fetch('api/addemail', requestOptions)
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          toast.error(data.error, { hideProgressBar: true, autoClose: 3000 })
        } else {
          toast.info('Your email has been added to the list.', {
            hideProgressBar: true,
            autoClose: 3000,
          })
          inputEmail.current.value = ''
          refreshData()
        }
      })
    event.preventDefault()
  }

  return (
    <div className="container">
      <Head>
        <title>Roadmap Voting</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <h1 className="title">
          <img src={logo} alt="Logo" className="logo" />
        </h1>

        <p className="description">
          Help us by voting our roadmap.
          <br />
          <span className="blue">&#x25B2;</span>
          Vote up the features you want to see in the next release.
        </p>

        <div className="grid">
          {loaded ? (
            items.map((item, ind) => (
              <div className="card" key={ind}>
                <span>{item.title}</span>
                <div className="upvotediv">
                  <a
                    onClick={(e) => vote(e, item.title)}
                    href={'#' + item.title}
                  >
                    &#x25B2; {item.score}
                  </a>
                </div>
              </div>
            ))
          ) : (
            <div className="card">
              <img src="/loader.gif" />
            </div>
          )}

          <div className="card">
            <form onSubmit={handleNewFeature}>
              <input
                type="text"
                className="noborder"
                ref={inputNewFeature}
                placeholder="Enter a new feature request?"
              />
              <input type="submit" value="Save" className="button" />
            </form>
          </div>

          <div className="card">
            <form onSubmit={handleNewEmail}>
              <input
                type="text"
                className="noborder"
                ref={inputEmail}
                placeholder="Enter your email to be notified on released items?"
              />
              <input type="submit" value="Save" className="button" />
            </form>
          </div>
        </div>
      </main>

      <footer>
        <a
          href="https://vercel.com/integrations/upstash"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by
          <img src="/vercel.svg" alt="Vercel Logo" />
          and
          <img src="/upstash.png" alt="Upstash Logo" />
        </a>
      </footer>
      <ToastContainer />
    </div>
  )
}

export default Home
