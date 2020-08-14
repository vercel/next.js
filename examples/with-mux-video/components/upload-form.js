import { useEffect, useRef, useState } from 'react'
import Router from 'next/router'
import * as UpChunk from '@mux/upchunk'
import useSwr from 'swr'
import Button from './button'
import Spinner from './spinner'
import ErrorMessage from './error-message'

const fetcher = (url) => {
  return fetch(url).then((res) => res.json())
}

const UploadForm = () => {
  const [isUploading, setIsUploading] = useState(false)
  const [isPreparing, setIsPreparing] = useState(false)
  const [uploadId, setUploadId] = useState(null)
  const [progress, setProgress] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const inputRef = useRef(null)

  const { data, error } = useSwr(
    () => (isPreparing ? `/api/upload/${uploadId}` : null),
    fetcher,
    { refreshInterval: 5000 }
  )

  const upload = data && data.upload

  useEffect(() => {
    if (upload && upload.asset_id) {
      Router.push({
        pathname: `/asset/${upload.asset_id}`,
        scroll: false,
      })
    }
  }, [upload])

  if (error) return <ErrorMessage message="Error fetching api" />
  if (data && data.error) return <ErrorMessage message={data.error} />

  const createUpload = async () => {
    try {
      return fetch('/api/upload', {
        method: 'POST',
      })
        .then((res) => res.json())
        .then(({ id, url }) => {
          setUploadId(id)
          return url
        })
    } catch (e) {
      console.error('Error in createUpload', e)
      setErrorMessage('Error creating upload')
    }
  }

  const startUpload = (evt) => {
    setIsUploading(true)
    const upload = UpChunk.createUpload({
      endpoint: createUpload,
      file: inputRef.current.files[0],
    })

    upload.on('error', (err) => {
      setErrorMessage(err.detail)
    })

    upload.on('progress', (progress) => {
      setProgress(Math.floor(progress.detail))
    })

    upload.on('success', () => {
      setIsPreparing(true)
    })
  }

  if (errorMessage) return <ErrorMessage message={errorMessage} />

  return (
    <>
      <div className="container">
        {isUploading ? (
          <>
            {isPreparing ? (
              <div>Preparing..</div>
            ) : (
              <div>Uploading...{progress ? `${progress}%` : ''}</div>
            )}
            <Spinner />
          </>
        ) : (
          <label>
            <Button type="button" onClick={() => inputRef.current.click()}>
              Select a video file
            </Button>
            <input type="file" onChange={startUpload} ref={inputRef} />
          </label>
        )}
      </div>
      <style jsx>{`
        input {
          display: none;
        }
      `}</style>
    </>
  )
}

export default UploadForm
