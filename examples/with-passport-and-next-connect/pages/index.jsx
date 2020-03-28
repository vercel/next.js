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
    <div className="form-container">
      <form onSubmit={handleSubmit} autoComplete="off">
        <input
          type="text"
          name="content"
          placeholder="write something silly"
          required
        />
        <div className="submit">
          <button type="submit">Post</button>
        </div>
      </form>
    </div>
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
          max-width: 21rem;
          margin: 0 auto 0.25rem;
          padding: 1rem;
          border: 1px solid #ccc;
          border-radius: 4px;
        }
        .delete {
          border: none;
        }
      `}</style>
      <div className="post">
        {isEditing ? (
          <form onSubmit={handleSave} autoComplete="off">
            <label>
              <input ref={inputRef} />
            </label>
            <div className="submit">
              <button type="submit">Save</button>
            </div>
          </form>
        ) : (
          <>
            <p>{post.content}</p>
            <div className="submit">
              <button type="button" onClick={() => setIsEditing(true)}>
                Edit
              </button>
              <button type="button" className="delete" onClick={handleDelete}>
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
      <h1>
        <a href="http://www.passportjs.org/">Passport.js</a> +{' '}
        <a href="https://github.com/hoangvvo/next-connect">next-connect</a>{' '}
        Example
      </h1>
      <p>Steps to test the example:</p>
      <ol>
        <li>
          Click Login and enter any username and <code>hackme</code> as
          password.
        </li>
        <li>
          You'll be redirected to Home. You now have access to the post editor
          and your posts
        </li>
        <li>Click Logout. You will no longer be able to access your posts.</li>
      </ol>

      {user && (
        <>
          <p>Currently logged in as: {JSON.stringify(user)}</p>
          <Editor />
          <h2>My posts</h2>
          <PostList />
        </>
      )}

      <style jsx>{`
        h2 {
          text-align: center;
        }
        li {
          margin-bottom: 0.5rem;
        }
      `}</style>
    </>
  )
}
