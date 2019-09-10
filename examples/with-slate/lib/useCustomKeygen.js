import { useRef } from 'react'
import { KeyUtils } from 'slate'

const useCustomKeygen = uniqueKey => {
  const ref = useRef(null)
  if (!ref.current || ref.current !== uniqueKey) {
    let n = 0
    const keygen = () => `${uniqueKey}${n++}`
    KeyUtils.setGenerator(keygen)
    ref.current = uniqueKey
  }
}

export default useCustomKeygen
