import { useState, useRef, useEffect } from 'react'
import { useUser, usePost } from '../lib/hooks'

function Editor() {
  const [, { mutate }] = usePost()
  async function handleSubmit(e) {
    e.preventDefault()
    const body = {
      content: e.currentTarget.content.value,
    }
    e.currentTarget.content.value = ''
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const allPosts = await res.json()
    mutate(allPosts)
  }
  return (
    <>
      <style jsx>{`
        form {
          display: flex;
          flex-direction: row;
          align-items: center;
        }
        button {
          margin: 0 0 0 0.5rem;
        }
      `}</style>
      <form onSubmit={handleSubmit} autoComplete="off">
        <input
          type="text"
          name="content"
          placeholder="write something silly"
          required
        />
        <button type="submit">Post</button>
      </form>
    </>
  )
}

function Post({ post }) {
  const [, { mutate }] = usePost()
  const [isEditing, setIsEditing] = useState(false)
  const inputRef = useRef()
  async function handleDelete() {
    const res = await fetch(`/api/posts/${post.id}`, {
      method: 'DELETE',
    })
    const allPosts = await res.json()
    mutate(allPosts)
  }

  async function handleSave(e) {
    e.preventDefault()
    const body = {
      content: inputRef.current.value,
    }
    const res = await fetch(`/api/posts/${post.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const allPosts = await res.json()
    mutate(allPosts)
    setIsEditing(false)
  }

  useEffect(() => {
    if (isEditing) {
      inputRef.current.value = post.content
    }
  }, [post, isEditing])

  return (
    <>
      <style jsx>{`
        .post {
          padding: 0.5rem 1rem;
          margin-bottom: 1rem;
          border-radius: 8px;
          box-shadow: 0 5px 10px rgba(0, 0, 0, 0.12);
        }
        .buttons {
          display: flex;
          flex-direction: row;
          align-items: center;
        }
      `}</style>
      <div className="post">
        {isEditing ? (
          <form onSubmit={handleSave} autoComplete="off">
            <label>
              <input ref={inputRef} />
            </label>
            <button>Save</button>
          </form>
        ) : (
          <>
            <p>{post.content}</p>
            <div className="buttons">
              <button type="button" onClick={() => setIsEditing(true)}>
                Edit
              </button>
              <button
                type="button"
                onClick={handleDelete}
                style={{
                  color: '#000',
                  backgroundColor: 'transparent',
                  marginLeft: '.5rem',
                }}
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function PostList() {
  const [posts] = usePost()
  return (
    <>
      <style jsx>{`
        p {
          color: #999;
          text-align: center;
        }
      `}</style>
      {posts?.length ? (
        posts.map(post => <Post key={post.id} post={post} />)
      ) : (
        <p>You have not write anything</p>
      )}
    </>
  )
}

export default function HomePage() {
  const [user] = useUser()
  return (
    <>
      <style jsx>{`
        h1 {
          text-align: center;
          font-size: 3rem;
          font-weight: 700;
        }
        p {
          color: #999;
          text-align: center;
        }
      `}</style>
      <h1>
        CRUD Example
        <br />
        <a href="https://github.com/hoangvvo/next-connect">
          next-connect
        </a> + <a href="http://www.passportjs.org/">Passport.js</a>
      </h1>
      {user ? (
        <>
          <Editor />
          <h2>{user.username}'s posts</h2>
          <PostList />
        </>
      ) : (
        <p>Sign in to use this app</p>
      )}
    </>
  )
}
