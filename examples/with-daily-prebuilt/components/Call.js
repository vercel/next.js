import DailyIframe from '@daily-co/daily-js'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { writeText } from 'clipboard-polyfill'
import ExpiryTimer from '../components/ExpiryTimer'

const CALL_OPTIONS = {
  showLeaveButton: true,
  iframeStyle: {
    height: '100%',
    width: '100%',
    aspectRatio: 16 / 9,
    minwidth: '400px',
    maxWidth: '920px',
    border: '0',
    borderRadius: '12px',
  },
}

export const Call = ({ room, setRoom, callFrame, setCallFrame, expiry }) => {
  const callRef = useRef(null)
  const [isLinkCopied, setIsLinkCopied] = useState(false)

  const handleCopyClick = useCallback(() => {
    writeText(room)
    setIsLinkCopied(true)
    setTimeout(() => setIsLinkCopied(false), 5000)
  }, [room])

  const createAndJoinCall = useCallback(() => {
    const newCallFrame = DailyIframe.createFrame(callRef?.current, CALL_OPTIONS)

    setCallFrame(newCallFrame)

    newCallFrame.join({ url: room })

    const leaveCall = () => {
      setRoom(null)
      setCallFrame(null)
      callFrame.destroy()
    }

    newCallFrame.on('left-meeting', leaveCall)
  }, [callFrame, room, setCallFrame, setRoom])

  /**
   * Initiate Daily iframe creation on component render if it doesn't already exist
   */
  useEffect(() => {
    if (callFrame) return

    createAndJoinCall()
  }, [callFrame, createAndJoinCall])

  return (
    <div className="call-container">
      {/* Daily iframe container */}
      <div ref={callRef} className="call" />
      <div className="controls">
        <h3>Invite participants</h3>
        <div>
          <label htmlFor="copy-url">
            Copy and share the URL below to invite others
          </label>
          <input
            id="copy-url"
            type="text"
            placeholder="Copy this room URL"
            value={room}
            pattern="^(https:\/\/)?[\w.-]+(\.(daily\.(co)))+[\/\/]+[\w.-]+$"
          />
          <button onClick={handleCopyClick} className="teal">
            {isLinkCopied ? 'Copied!' : `Copy room URL`}
          </button>
          <hr></hr>
        </div>
        <div>
          {expiry && (
            <div className="expiry">
              <h3>Room expires in: </h3>
              <ExpiryTimer expiry={expiry} />
            </div>
          )}
        </div>
      </div>
      <style jsx>{`
        .call-container {
          display: flex;
          max-width: 1200px;
          margin: auto;
          flex: 1;
          flex-wrap: wrap;
          height: 55%;
        }
        .call {
          flex: 1;
          margin-top: 24px;
        }
        .controls {
          padding: 24px;
          text-align: left;
          max-width: 400px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .controls h3 {
          font-weight: bold;
          font-size: 16px;
          margin-top: 0px;
        }
        .controls label {
          font-size: 14px;
          margin-bottom: 8px;
        }
        .controls button {
          color: var(--dark-blue);
          background: var(--white);
          border: 1px solid var(--grey);
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 12px;
          line-height: 16px;
          font-weight: bold;
          cursor: pointer;
          margin-right: 4px;
          margin-bottom: 8px;
        }
        .controls button.teal {
          background: var(--teal);
          margin-bottom: 0;
        }
        .controls button.teal:active {
          opacity: 0.7;
        }
        .controls input {
          margin-right: 8px;
          margin-top: 8px;
          margin-bottom: 8px;
          height: 32px;
          border-radius: 8px;
          border: 1px solid var(--grey);
          min-width: 200px;
          padding: 0 8px;
        }
        .controls hr {
          border-top: 1px solid var(--grey);
        }
        .expiry {
          display: flex;
        }
        @media (max-width: 900px) {
          .call-container {
            align-items: center;
            flex-direction: column;
            margin: 8px;
            height: 100%;
          }
        }
      `}</style>
    </div>
  )
}

export default Call
