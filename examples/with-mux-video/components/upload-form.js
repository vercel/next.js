import { useRef, useState } from 'react'
import * as UpChunk from '@mux/upchunk'
import Button from './button'
import Spinner from './spinner'

const UploadForm = ({ uploadUrl, onStart, onSuccess }) => {
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const inputRef = useRef(null)

  const startUpload = () => {
    onStart()
    setIsUploading(true)
    const upload = UpChunk.createUpload({
      endpoint: uploadUrl,
      file: inputRef.current.files[0],
    })

    upload.on('error', err => {
      console.error('💥 🙀', err.detail)
      setErrorMessage(err.detail)
    })

    upload.on('progress', progress => {
      setProgress(progress.detail)
    })

    upload.on('success', () => {
      onSuccess()
    })
  }

  if (errorMessage) return <div>{errorMessage}</div>

  return (
    <>
      <div className="instructions-wrapper">
        <p className="instructions">
          When you select a file, it will uploaded via{' '}
          <a
            href="https://docs.mux.com/docs/direct-upload"
            target="_blank"
            rel="noopener noreferrer"
          >
            Mux Direct Upload API
          </a>
          . Shortly after, the video will be ready for playback on this URL.
        </p>
      </div>
      <div className="button-wrapper">
        {isUploading ? (
          <>
            <p>Uploading...{progress ? `${progress}%` : ''}</p>
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
        .instructions-wrapper {
          display: flex;
          width: 100%;
          justify-content: space-around;
        }
        .instructions {
          max-width: 400px;
        }
        .button-wrapper {
          padding-top: 40px;
          text-align: center;
        }
        input {
          display: none;
        }
      `}</style>
    </>
  )
}

export default UploadForm
