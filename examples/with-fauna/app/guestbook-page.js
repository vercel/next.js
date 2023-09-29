"use client"

import cn from 'classnames'
import 'tailwindcss/tailwind.css'
import formatDate from 'date-fns/format'
import { useState } from 'react'
import SuccessMessage from '@/components/SuccessMessage'
import ErrorMessage from '@/components/ErrorMessage'
import LoadingSpinner from '@/components/LoadingSpinner'


const EntryItem = ({ entry }) => (
  <div className="flex flex-col space-y-2">
    <div className="prose dark:prose-dark w-full">{entry.message}</div>
    <div className="flex items-center space-x-3">
      <p className="text-sm text-gray-500">{entry.name}</p>
      <span className="text-gray-200 dark:text-gray-800">/</span>
      <p className="text-sm text-gray-400 dark:text-gray-600">
        {formatDate(new Date(entry.createdAt.isoString), "d MMM yyyy 'at' h:mm bb")}
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

export default function GuestbookPage({ entries }) {
	const [allEntries, setAllEntries] = useState(entries);
	const onSubmit = async (payload) => {
		const response = await fetch('/api/entries', {
			method: 'POST',
			body: JSON.stringify(payload),
			headers: {
				'Content-Type': 'application/json',
			},
		});

		const newEntry = await response.json();
		setAllEntries((entries) => [newEntry, ...entries]);
	}
	return (
		<main className="max-w-4xl mx-auto p-4">
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
				{allEntries?.map((entry) => (
					<EntryItem key={entry.id} entry={entry} />
				))}
			</div>
		</main>
	)
}