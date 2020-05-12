import { useRef, useState } from 'react'
import * as UpChunk from '@mux/upchunk'

const UploadForm = ({ uploadUrl, onSuccess }) => {
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const inputRef = useRef(null)

  const startUpload = () => {
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
    <div>
      {isUploading ? (
        <div>Uploading...{progress ? `${progress}%` : ''}</div>
      ) : (
        <input type="file" onChange={startUpload} ref={inputRef} />
      )}
    </div>
  )
}

export default UploadForm
