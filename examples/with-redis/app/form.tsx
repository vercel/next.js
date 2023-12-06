'use client'

import clsx from 'clsx'
import { useOptimistic, useRef } from 'react'
import { saveFeature, upvote } from './actions'
import { v4 as uuidv4 } from 'uuid'
import { Feature } from './types'

type FeatureState = {
  newFeature: Feature
  updatedFeature?: Feature
  pending: boolean
}

export default function FeatureForm({ features }: { features: Feature[] }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [state, mutate] = useOptimistic(
    { features, pending: false },
    function createReducer(state, newState: FeatureState) {
      if (newState.newFeature) {
        return {
          features: [...state.features, newState.newFeature],
          pending: newState.pending,
        }
      } else {
        return {
          features: [
            ...state.features.filter(
              (f) => f.id !== newState.updatedFeature!.id
            ),
            newState.updatedFeature,
          ] as Feature[],
          pending: newState.pending,
        }
      }
    }
  )

  let sortedFeatures = state.features.sort((a, b) => {
    // First, compare by score in descending order
    if (Number(a.score) > Number(b.score)) return -1
    if (Number(a.score) < Number(b.score)) return 1

    // If scores are equal, then sort by created_at in ascending order
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  return (
    <>
      <div className="mx-8 w-full">
        <form
          className="relative my-8"
          ref={formRef}
          action={async (formData) => {
            const newFeature = {
              id: uuidv4(),
              title: `${formData.get('feature')}`,
              created_at: new Date().toISOString(),
              score: '1',
            }

            mutate({
              newFeature,
              pending: true,
            })
            formRef.current?.reset()
            await saveFeature(newFeature)
          }}
        >
          <input
            aria-label="Suggest a feature for our roadmap"
            className="pl-3 pr-28 py-3 mt-1 text-lg block w-full border border-gray-200 rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:ring focus:ring-blue-300"
            maxLength={150}
            placeholder="I want..."
            required
            type="text"
            name="feature"
            disabled={state.pending}
          />
          <button
            className={clsx(
              'flex items-center justify-center absolute right-2 top-2 px-4 h-10 text-lg border bg-black text-white rounded-md w-24 focus:outline-none focus:ring focus:ring-blue-300 focus:bg-gray-800',
              state.pending && 'bg-gray-700 cursor-not-allowed'
            )}
            type="submit"
            disabled={state.pending}
          >
            Request
          </button>
        </form>
      </div>
      <div className="w-full">
        {sortedFeatures.map((feature: any, index: number) => (
          <Item
            key={feature.id}
            isFirst={index === 0}
            isLast={index === sortedFeatures.length - 1}
            isReleased={false}
            hasVoted={false}
            feature={feature}
            pending={state.pending}
            mutate={mutate}
          />
        ))}
      </div>
    </>
  )
}

function Item({
  isFirst,
  isLast,
  isReleased,
  hasVoted,
  feature,
  pending,
  mutate,
}: {
  isFirst: boolean
  isLast: boolean
  isReleased: boolean
  hasVoted: boolean
  feature: Feature
  pending: boolean
  mutate: any
}) {
  return (
    <form
      action={async () => {
        mutate({
          updatedFeature: {
            ...feature,
            score: (Number(feature.score) + 1).toString(),
          },
          pending: true,
        })
        await upvote(feature)
      }}
      className={clsx(
        'p-6 mx-8 flex items-center border-t border-l border-r',
        isFirst && 'rounded-t-md',
        isLast && 'border-b rounded-b-md'
      )}
    >
      <button
        className={clsx(
          'ring-1 ring-gray-200 rounded-full w-8 min-w-[2rem] h-8 mr-4 focus:outline-none focus:ring focus:ring-blue-300',
          (isReleased || hasVoted) &&
            'bg-green-100 cursor-not-allowed ring-green-300',
          pending && 'bg-gray-100 cursor-not-allowed'
        )}
        disabled={isReleased || hasVoted || pending}
        type="submit"
      >
        {isReleased ? '✅' : '👍'}
      </button>
      <h3 className="text font-semibold w-full text-left">{feature.title}</h3>
      <div className="bg-gray-200 text-gray-700 text-sm rounded-xl px-2 ml-2">
        {feature.score}
      </div>
    </form>
  )
}
