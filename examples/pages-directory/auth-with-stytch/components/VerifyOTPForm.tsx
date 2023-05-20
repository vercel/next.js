import React from 'react'
import styles from '../styles/Home.module.css'
import { sendOTP } from '../lib/otpUtils'
import { useRouter } from 'next/router'

// Handles auto-tabbing to next passcode digit input.
// Logic inspired from https://stackoverflow.com/questions/15595652/focus-next-input-once-reaching-maxlength-value.
const autoTab = (target: HTMLInputElement, key?: string) => {
  if (target.value.length >= target.maxLength) {
    let next = target
    while ((next = next.nextElementSibling as HTMLInputElement)) {
      if (next == null) break
      if (next.tagName.toLowerCase() === 'input') {
        next?.focus()
        break
      }
    }
  }
  // Move to previous field if empty (user pressed backspace)
  else if (target.value.length === 0) {
    let previous = target
    while ((previous = previous.previousElementSibling as HTMLInputElement)) {
      if (previous == null) break
      if (previous.tagName.toLowerCase() === 'input') {
        previous.focus()
        break
      }
    }
  }
}

type Props = {
  methodId: string
  phoneNumber: string
}

const VerifyOTPForm = (props: Props) => {
  const { methodId, phoneNumber } = props
  const [isDisabled, setIsDisabled] = React.useState(true)
  const [currentMethodId, setCurrentMethodId] = React.useState(methodId)
  const [isError, setIsError] = React.useState(false)
  const router = useRouter()

  const strippedNumber = phoneNumber.replace(/\D/g, '')
  const parsedPhoneNumber = `(${strippedNumber.slice(
    0,
    3
  )}) ${strippedNumber.slice(3, 6)}-${strippedNumber.slice(6, 10)}`

  const isValidPasscode = () => {
    const regex = /^[0-9]$/g
    const inputs = document.getElementsByClassName(styles.passcodeInput)
    for (let i = 0; i < inputs.length; i++) {
      if (!(inputs[i] as HTMLInputElement).value.match(regex)) {
        return false
      }
    }
    return true
  }

  const onPasscodeDigitChange = () => {
    if (isValidPasscode()) {
      setIsDisabled(false)
      setIsError(false)
    } else {
      setIsDisabled(true)
    }
  }

  const resetPasscode = () => {
    const inputs = document.getElementsByClassName(styles.passcodeInput)
    for (let i = 0; i < inputs.length; i++) {
      ;(inputs[i] as HTMLInputElement).value = ''
    }
    document.getElementById('digit-0')?.focus()
    setIsDisabled(true)
  }

  const resendCode = async () => {
    const methodId = await sendOTP(phoneNumber)
    setCurrentMethodId(methodId)
    resetPasscode()
    setIsError(false)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isValidPasscode()) {
      let otpInput = ''
      const inputs = document.getElementsByClassName(styles.passcodeInput)
      for (let i = 0; i < inputs.length; i++) {
        otpInput += (inputs[i] as HTMLInputElement).value
      }

      const resp = await fetch('/api/authenticate_otp', {
        method: 'POST',
        body: JSON.stringify({ otpInput, methodId: currentMethodId }),
      })

      if (resp.status === 200) {
        router.push('/profile')
      } else {
        setIsError(true)
        resetPasscode()
      }
    }
  }

  const renderPasscodeInputs = () => {
    const inputs = []
    for (let i = 0; i < 6; i += 1) {
      inputs.push(
        <input
          autoFocus={i === 0}
          className={styles.passcodeInput}
          id={`digit-${i}`}
          key={i}
          maxLength={1}
          onChange={onPasscodeDigitChange}
          onKeyUp={(e) => autoTab(e.target as HTMLInputElement, e.key)}
          placeholder="0"
          size={1}
          type="text"
        />
      )
    }
    return inputs
  }

  return (
    <div>
      <h2>Enter passcode</h2>
      <p className={styles.smsInstructions}>
        A 6-digit passcode was sent to you at{' '}
        <strong>{parsedPhoneNumber}</strong>.
      </p>
      <form onSubmit={onSubmit}>
        <div className={styles.passcodeContainer}>
          <p className={styles.errorText}>
            {isError ? 'Invalid code. Please try again.' : ''}
          </p>
          <div className={styles.passcodeInputContainer}>
            {renderPasscodeInputs()}
          </div>
        </div>
        <div className={styles.resendCodeContainer}>
          <p className={styles.resendCodeText}>Didn’t get it? </p>
          <button
            className={`${styles.resendCodeButton} ${styles.resendCodeText}`}
            onClick={resendCode}
            type="button"
          >
            Resend code
          </button>
        </div>
        <input
          className={styles.primaryButton}
          disabled={isDisabled}
          id="button"
          type="submit"
          value="Continue"
        />
      </form>
    </div>
  )
}

export default VerifyOTPForm
