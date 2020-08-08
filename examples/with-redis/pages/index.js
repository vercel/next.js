import Head from 'next/head'
import { ToastContainer, toast } from 'react-toastify'
import React, { useState, useRef, useEffect } from 'react'

function Home() {
  const [items, setItems] = useState(0)
  const inputNewFeature = useRef()
  const inputEmail = useRef()

  useEffect(() => {
    refreshData()
  }, [])

  function refreshData() {
    fetch('api/list')
      .then((res) => res.json())
      .then(
        (result) => {
          setItems(result.body)
          inputNewFeature.current.value = ''
          inputEmail.current.value = ''
        },
        (error) => {
          setItems([])
        }
      )
  }

  function handleNewFeature(event) {
    const requestOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: inputNewFeature.current.value }),
    }
    fetch('api/create', requestOptions)
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          toast.error(data.error, { hideProgressBar: true, autoClose: 3000 })
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

  function handleNewEmail(event) {
    const requestOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inputEmail.current.value }),
    }
    console.log(requestOptions)
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
          refreshData()
        }
      })
    event.preventDefault()
  }

  function vote(event, id) {
    const requestOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id }),
    }
    console.log(requestOptions)
    fetch('api/vote', requestOptions)
      .then((response) => response.json())
      .then((data) => {
        console.log(data)
        if (data.error) {
          toast.error(data.error, { hideProgressBar: true, autoClose: 3000 })
        } else {
          refreshData()
        }
      })
  }

  return (
    <div className="container">
      <Head>
        <title>Roadmap Voting</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <h1 className="title">
          <img src="/logo.png" alt="Your Project Logo" className="logo" />
        </h1>

        <p className="description">
          Help us by voting our roadmap. <br />
          <span className="blue">&#x25B2;</span>
          Vote up the features you want to see in the next release.
        </p>

        <div className="grid">
          {items
            ? items.map((item, ind) => (
                <div className="card" key={ind}>
                  <span>{item.title}</span>
                  <div className="upvotediv">
                    <a onClick={(e) => vote(e, item.id)} href={'#' + item.id}>
                      &#x25B2; {item.score}
                    </a>
                  </div>
                </div>
              ))
            : ''}

          <div className="card">
            <form onSubmit={(e) => handleNewFeature(e)}>
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
            <form onSubmit={(e) => handleNewEmail(e)}>
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
          href="http://github.com/vercel/next.js/tree/canary/examples/with-redis"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by
          <img src="/vercel.svg" alt="Vercel Logo" />
          and
          <img src="/lstr.png" alt="Lambda Store Logo" />
        </a>
      </footer>
      <ToastContainer />
    </div>
  )
}

export default Home
