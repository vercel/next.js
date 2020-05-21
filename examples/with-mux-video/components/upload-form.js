import { useEffect, useRef, useState } from 'react'
import Router from 'next/router'
import * as UpChunk from '@mux/upchunk'
import useSwr from 'swr'
import Button from './button'
import Spinner from './spinner'

const fetcher = url => {
  return fetch(url).then(res => res.json())
}

const ErrorMessage = ({ message }) => (
  <>
    <div className='message'>
      {message || 'Unknown error'}
    </div>
    <style jsx>{`
      .message {
        color: #d61313;
      }
    `}</style>
  </>
)

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

  const asset = data && data.asset

  useEffect(() => {
    if (asset && asset.playback_id && asset.status === 'ready') {
      Router.push(`/v/${asset.playback_id}`)
    }
  }, [asset]);

  if (error) return <ErrorMessage message='Error fetching api' />
  if (data && data.error) return <ErrorMessage message={data.error} />

  const createUpload = async () => {
    try {
      return fetch('/api/upload', {
        method: 'POST',
      }).then(res => res.json()).then(({ id, url }) => {
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

    upload.on('error', err => {
      setErrorMessage(err.detail)
    })

    upload.on('progress', progress => {
      setProgress(progress.detail)
    })

    upload.on('success', () => {
      setIsPreparing(true);
    })
  }

  if (errorMessage) return <ErrorMessage message={errorMessage} />

  return (
    <>
      <div>
        {isUploading ? (
          <>
            { isPreparing ? <p>Preparing..</p> : <p>Uploading...{progress ? `${progress}%` : ''}</p> }
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
