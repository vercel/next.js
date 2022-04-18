import React, { useState } from 'react'
import { GetServerSidePropsContext, InferGetServerSidePropsType } from 'next'
import Layout from '../../components/Layout'
import Router from 'next/router'
import { client, e } from '../../client'

import ReactMarkdown from 'react-markdown'

async function update(
  id: string,
  data: { title?: string; content?: string }
): Promise<void> {
  await fetch(`/api/post/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  alert('Draft saved!')
}

async function publish(id: string): Promise<void> {
  await fetch(`/api/publish/${id}`, {
    method: 'PUT',
  })
  await Router.push(`/blog/${id}`)
}

async function destroy(id: string): Promise<void> {
  await fetch(`/api/post/${id}`, {
    method: 'DELETE',
  })
  await Router.push('/')
}

const Post: React.FC<PostProps> = (props) => {
  const [patch, setPatch] = useState<{
    title?: string
    content?: string
  }>({
    title: props.title,
    content: props.content || undefined,
  })

  if (props.publishedISO) {
    return (
      <Layout>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            margin: 'auto',
            maxWidth: '600px',
          }}
        >
          <h1 style={{ paddingTop: '100px', margin: 0, paddingBottom: '8px' }}>
            {props.title}
          </h1>
          <p style={{ fontSize: '14pt', margin: 0, color: '#888' }}>
            By {props.authorName}
          </p>
          <br />
          <br />
          <ReactMarkdown>{props.content || ''}</ReactMarkdown>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
        }}
      >
        <input
          value={patch.title}
          onChange={(e) => {
            setPatch({ ...patch, title: e.target.value })
          }}
        />

        <textarea
          rows={25}
          value={patch.content || ''}
          onChange={(e) => {
            setPatch({ ...patch, content: e.target.value })
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'row' }}>
          <button
            style={{ backgroundColor: '#0E61FE', color: 'white' }}
            onClick={() => update(props.id, patch)}
          >
            {props.publishedISO ? 'Update' : 'Save draft'}
          </button>
          {!props.publishedISO && (
            <button
              style={{ backgroundColor: '#0E61FE', color: 'white' }}
              onClick={() => publish(props.id)}
            >
              Publish
            </button>
          )}
          <button
            style={{ border: '2px solid red', color: 'red' }}
            onClick={() => destroy(props.id)}
          >
            Delete
          </button>
        </div>
      </div>
      <style jsx>{`
        .page {
          padding: 2rem;
        }
        h2 {
          margin: 0px;
        }
        input {
          font-size: 20pt;
        }
        textarea,
        input {
          margin: 0 0 0.75rem 0;
          padding: 0.5rem;
          border: 0.125rem solid rgba(0, 0, 0, 0.2);
          border-radius: 0.25rem;
        }

        .actions {
          margin-top: 2rem;
        }

        button {
          border: 2px solid transparent;
          border-radius: 4px;
          padding: 0.5rem 1.25rem;
          background-color: unset;
        }

        button + button {
          margin-left: 0.5rem;
        }
      `}</style>
    </Layout>
  )
}

export const getServerSideProps = async (
  context?: GetServerSidePropsContext
) => {
  const post = await e
    .select(e.Post, (post) => ({
      id: true,
      title: true,
      content: true,
      publishedISO: true,
      authorName: true,
      filter: e.op(post.id, '=', e.uuid(context!.params!.id as string)),
    }))
    .run(client)

  return { props: post! }
}

export type PostProps = InferGetServerSidePropsType<typeof getServerSideProps>
export default Post
