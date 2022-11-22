import Head from 'next/head'
import { useState } from 'react'
import cn from 'classnames'
import formatDate from 'date-fns/format'
import useSWR, { mutate, SWRConfig } from 'swr'
import 'tailwindcss/tailwind.css'
import { listGuestbookEntries } from '@/lib/fauna'
import SuccessMessage from '@/components/SuccessMessage'
import ErrorMessage from '@/components/ErrorMessage'
import LoadingSpinner from '@/components/LoadingSpinner'

const fetcher = (url) => fetch(url).then((res) => res.json())

const putEntry = (payload) =>
  fetch('/api/entries', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json',
    },
  }).then((res) => (res.ok ? res.json() : Promise.reject(res)))

const useEntriesFlow = ({ fallback }) => {
  const { data: entries } = useSWR('/api/entries', fetcher, {
    fallbackData: fallback.entries,
  })
  const onSubmit = async (payload) => {
    await putEntry(payload)
    await mutate('/api/entries')
  }

  return {
    entries,
    onSubmit,
  }
}

const AppHead = () => (
  <Head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="shortcut icon" type="image/x-icon" href="/static/favicon.png" />
  </Head>
)

const EntryItem = ({ entry }) => (
  <div className="flex flex-col space-y-2">
    <div className="prose dark:prose-dark w-full">{entry.message}</div>
    <div className="flex items-center space-x-3">
      <p className="text-sm text-gray-500">{entry.name}</p>
      <span className="text-gray-200 dark:text-gray-800">/</span>
      <p className="text-sm text-gray-400 dark:text-gray-600">
        {formatDate(new Date(entry.createdAt), "d MMM yyyy 'at' h:mm bb")}
      </p>
    </div>
  </div>
)

const EntryForm = ({ onSubmit: onSubmitProp }) => {
  const initial = {
    name: '',
    message: '',
  }
  const [values, setValues] = useState(initial)
  const [formState, setFormState] = useState('initial')
  const isSubmitting = formState === 'submitting'

  const onSubmit = (ev) => {
    ev.preventDefault()

    setFormState('submitting')
    onSubmitProp(values)
      .then(() => {
        setValues(initial)
        setFormState('submitted')
      })
      .catch(() => {
        setFormState('failed')
      })
  }

  const makeOnChange =
    (fieldName) =>
    ({ target: { value } }) =>
      setValues({
        ...values,
        [fieldName]: value,
      })

  const inputClasses = cn(
    'block py-2 bg-white dark:bg-gray-800',
    'rounded-md border-gray-300 focus:ring-blue-500',
    'focus:border-blue-500 text-gray-900 dark:text-gray-100'
  )

  return (
    <>
      <form className="flex relative my-4" onSubmit={onSubmit}>
        <input
          required
          className={cn(inputClasses, 'w-1/3 mr-2 px-4')}
          aria-label="Your name"
          placeholder="Your name..."
          value={values.name}
          onChange={makeOnChange('name')}
        />
        <input
          required
          className={cn(inputClasses, 'pl-4 pr-32 flex-grow')}
          aria-label="Your message"
          placeholder="Your message..."
          value={values.message}
          onChange={makeOnChange('message')}
        />
        <button
          className={cn(
            'flex items-center justify-center',
            'absolute right-1 top-1 px-4 font-bold h-8',
            'bg-gray-100 dark:bg-gray-700 text-gray-900',
            'dark:text-gray-100 rounded w-28'
          )}
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? <LoadingSpinner /> : 'Sign'}
        </button>
      </form>
      {{
        failed: () => <ErrorMessage>Something went wrong. :(</ErrorMessage>,

        submitted: () => (
          <SuccessMessage>Thanks for signing the guestbook.</SuccessMessage>
        ),
      }[formState]?.()}
    </>
  )
}

const Guestbook = ({ fallback }) => {
  const { entries, onSubmit } = useEntriesFlow({ fallback })
  return (
    <SWRConfig value={{ fallback }}>
      <main className="max-w-4xl mx-auto p-4">
        <AppHead />
        <div
          className={cn(
            'border border-blue-200 rounded p-6',
            'my-4 w-full dark:border-gray-800 bg-blue-50',
            'dark:bg-blue-opaque'
          )}
        >
          <h5 className={cn('text-lg md:text-xl font-bold', 'text-gray-900')}>
            Sign the Guestbook
          </h5>
          <p className="my-1 text-gray-800">
            Share a message for a future visitor.
          </p>
          <EntryForm onSubmit={onSubmit} />
        </div>
        <div className="mt-4 space-y-8 px-2">
          {entries?.map((entry) => (
            <EntryItem key={entry._id} entry={entry} />
          ))}
        </div>
      </main>
    </SWRConfig>
  )
}

export async function getStaticProps() {
  const entries = await listGuestbookEntries()
  return {
    props: {
      fallback: {
        entries,
      },
    },
  }
}

export default Guestbook
