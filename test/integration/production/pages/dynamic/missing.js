import dynamic from 'next/dynamic'

const Missing = dynamic(() => import('../../components/missing'),
  {
    loading: ({ error, isLoading, pastDelay }) => {
      if (!pastDelay) return null
      if (isLoading) {
        return <p>loading...</p>
      }
      if (error) {
        return <p>{error.message}</p>
      }
    }
  })

export default () => (
  <div>
    <Missing />
  </div>
)
