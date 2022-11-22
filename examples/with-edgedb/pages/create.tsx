import React, { useState } from 'react'
import Layout from '../components/Layout'
import Router from 'next/router'
import Link from 'next/link'

const Draft: React.FC = () => {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [authorName, setAuthorName] = useState('')

  const submitData = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    try {
      const body = { title, content, authorName }
      const result = await fetch(`/api/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      await result.json()
      await Router.push('/drafts')
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <Layout>
      <div>
        <form onSubmit={submitData}>
          <h1>Create draft</h1>
          <input
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            type="text"
            value={title}
          />
          <input
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder="Author name"
            type="text"
            value={authorName}
          />
          <textarea
            cols={50}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Content"
            rows={8}
            value={content}
          />
          <input
            disabled={!content || !title || !authorName}
            type="submit"
            value="Create"
          />
          <Link href="/" legacyBehavior>
            <a className="back">Cancel</a>
          </Link>
        </form>
      </div>
      <style jsx>{`
        .page {
          background: white;
          padding: 3rem;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        input[type='text'],
        textarea {
          width: 100%;
          padding: 0.5rem;
          margin: 0 0 0.75rem 0;
          border-radius: 0.25rem;
          border: 0.125rem solid rgba(0, 0, 0, 0.2);
        }

        input[type='submit'] {
          cursor: pointer;
          border: 2px solid transparent;
          border-radius: 4px;
          padding: 0.5rem 1.25rem;
          background-color: #0e61fe;
          color: white;
        }

        .back {
          margin-left: 1rem;
        }
      `}</style>
    </Layout>
  )
}

export default Draft
