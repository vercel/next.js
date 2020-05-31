import Head from 'next/head'
import Link from 'next/link'
import Router from 'next/router'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import ReactMarkdown from 'react-markdown'
import ReactMde from 'react-mde'
import { useEffectReducer } from 'use-effect-reducer'

function editorReducer(state, event, exec) {
  switch (event.type) {
    case 'FETCH_CATEGORIES':
      exec({ type: 'fetchCategories' })
      return {
        ...state,
        state: 'fetching',
      }

    case 'CATEGORIES_FETCHED':
      return {
        ...state,
        categories: event.categories,
      }

    case 'SAVE_ARTICLE':
      if (state.state !== 'saving') {
        exec({ type: 'saveArticle', article: event.article })

        return {
          ...state,
          state: 'saving',
        }
      } else return state

    case 'ARTICLE_PUBLISHED':
      exec(() => Router.push(`/article/${event.article.slug}`))
      return {
        ...state,
        state: 'done',
      }

    case 'VALIDATION_ERRORS':
      return {
        ...state,
        state: 'error',
        errors: event.errors,
      }

    default:
      return state
  }
}
function getInitialState(exec) {
  exec({ type: 'fetchCategories' })

  return {
    state: 'init',
    categories: [],
  }
}
async function fetchCategories(_, __, dispatch) {
  const response = await fetch('/api/category')

  if (response.ok) {
    const categories = await response.json()
    dispatch({ type: 'CATEGORIES_FETCHED', categories })
  }
}
async function saveArticle(_, effect, dispatch) {
  const response = await fetch('/api/article', {
    method: 'POST',
    body: JSON.stringify(effect.article),
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (response.ok) {
    const article = await response.json()
    dispatch({ type: 'ARTICLE_PUBLISHED', article })
  } else if (response.status === 422) {
    const { errors } = await response.json()
    dispatch({ type: 'VALIDATION_ERRORS', errors })
  }
}
const EditorPage = () => {
  const [state, dispatch] = useEffectReducer(editorReducer, getInitialState, {
    fetchCategories,
    saveArticle,
  })
  const [selectedTab, setSelectedTab] = useState('write')
  const { control, errors, handleSubmit, register } = useForm()

  return (
    <>
      <Head>
        <title>Blog | Create a new article</title>
      </Head>
      <header>
        <nav className="navbar navbar-expand-md navbar-dark bg-dark fixed-top">
          <div className="container">
            <Link href="/">
              <a className="navbar-brand">Blog</a>
            </Link>
          </div>
        </nav>
      </header>
      <main role="main" className="container p-5 mt-3 bg-light">
        <div className="d-flex align-items-center p-3 my-3 rounded shadow-sm bg-white">
          <form
            className="w-100"
            onSubmit={handleSubmit((article) =>
              dispatch({ type: 'SAVE_ARTICLE', article })
            )}
          >
            <h1>Create a new article</h1>
            <hr />
            {state.errors && (
              <div className="alert alert-warning" role="alert">
                <ul>
                  {Object.entries(state.errors).map(([property, message]) => (
                    <li key={property}>{message}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="form-group">
              <label htmlFor="titleTxt">Title</label>
              <input
                id="titleTxt"
                name="title"
                className={`form-control${errors.title ? ' is-invalid' : ''}`}
                ref={register({
                  required: 'Title should be defined',
                  min: {
                    value: 1,
                    message: 'Title should not be empty',
                  },
                })}
              />
              {errors.title && (
                <small className="invalid-feedback">
                  {errors.title.message}
                </small>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="categorySel">Category</label>
              <select
                id="categorySel"
                name="category"
                className={`custom-select${
                  errors.category ? ' is-invalid' : ''
                }`}
                ref={register({
                  required: 'Category should be defined',
                  validate: (value) =>
                    state.categories.findIndex(
                      (category) => category._id === value
                    ) === -1
                      ? 'Choose a valid category'
                      : true,
                })}
              >
                {state.state === 'fetching' ? (
                  <option>Loading categories</option>
                ) : (
                  <option value>Select a category</option>
                )}
                {state.categories.map((category) => (
                  <option value={category._id} key={category._id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {errors.category && (
                <small className="invalid-feedback">
                  {errors.category.message}
                </small>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="abstractTxt">Abstract</label>
              <textarea
                id="abstractTxt"
                name="abstract"
                row="6"
                className={`form-control${
                  errors.abstract ? ' is-invalid' : ''
                }`}
                ref={register({
                  required: 'Abstract should be defined',
                  maxLength: {
                    value: 280,
                    message: 'Abstract should be less than 280 characters',
                  },
                })}
              ></textarea>
              {errors.abstract && (
                <small className="invalid-feedback">
                  {errors.abstract.message}
                </small>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="bodyTxt">Body</label>
              <Controller
                name="body"
                control={control}
                rules={{
                  required: 'Body should be defined',
                }}
                as={
                  <ReactMde
                    minEditorHeight={400}
                    selectedTab={selectedTab}
                    onTabChange={setSelectedTab}
                    textAreaProps={{ id: 'bodyTxt' }}
                    generateMarkdownPreview={(markdown) =>
                      Promise.resolve(<ReactMarkdown source={markdown} />)
                    }
                  />
                }
              />
              {errors.body && (
                <small className="text-danger">{errors.body.message}</small>
              )}
            </div>
            <button type="submit" className="btn btn-primary float-right">
              Publish article
            </button>
          </form>
        </div>
      </main>
    </>
  )
}

export default EditorPage
