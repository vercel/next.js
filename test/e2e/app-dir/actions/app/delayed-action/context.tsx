import React from 'react'

export const DataContext = React.createContext<{
  data: number | null
  setData: (number: number) => void
}>({ data: null, setData: () => {} })
