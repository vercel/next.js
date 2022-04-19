import React from 'react'

const colors = {
  archived: 'red-600',
  published: 'green-500',
  revision: 'amber-500',
  draft: 'transparent',
}

export const DotState = ({ language, ...data }) => {
  const state = getState(data)
  const color = colors[state]

  return (
    <>
      <div
        className={`rounded-full box-border w-4 h-4 border-2 border-solid mr-2 bg-${color}`}
      />
      <div className="flex p-px px-0.5 border border-solid border-violet-700 rounded-sm">
        <span className="text-xs texts-violet-700 lowercase">{language}</span>
      </div>
    </>
  )
}

const getState = ({ live, archived, working, hasLiveVersion })=> {
  if (archived) {
    return 'archived'
  }

  if (live && hasLiveVersion && working) {
    return 'published'
  }

  if (hasLiveVersion) {
    return 'revision'
  }

  return 'draft'
}
