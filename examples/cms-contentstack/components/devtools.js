import React, { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Tooltip from './tool-tip'

const DynamicReactJson = dynamic(import('react-json-view'), { ssr: false })

function filterObject(inputObject) {
  const unWantedProps = [
    '_version',
    'ACL',
    '_owner',
    '_in_progress',
    'created_at',
    'created_by',
    'updated_at',
    'updated_by',
    'publish_details',
  ]
  for (const key in inputObject) {
    unWantedProps.includes(key) && delete inputObject[key]
    if (typeof inputObject[key] !== 'object') {
      continue
    }
    inputObject[key] = filterObject(inputObject[key])
  }
  return inputObject
}

const DevTools = ({ response }) => {
  const filteredJson = filterObject(response)
  const [forceUpdate, setForceUpdate] = useState(0)

  function copyObject(object) {
    navigator.clipboard.writeText(object)
    setForceUpdate(1)
  }

  useEffect(() => {
    if (forceUpdate !== 0) {
      setTimeout(() => setForceUpdate(0), 300)
    }
  }, [forceUpdate])

  return (
    <div
      className="modal fade"
      id="staticBackdrop"
      data-bs-backdrop="static"
      data-bs-keyboard="false"
      tabIndex="-1"
      aria-labelledby="staticBackdropLabel"
      aria-hidden="true"
      role="dialog"
    >
      <div
        className="modal-dialog .modal-lg modal-dialog-centered modal-dialog-scrollable"
        role="document"
      >
        <div className="modal-content">
          <div className="modal-header">
            <h2 className="devtools-modal-title" id="staticBackdropLabel">
              JSON Preview
            </h2>
            <span
              className="json-copy"
              onClick={(e) => copyObject(JSON.stringify(filteredJson))}
              aria-hidden="true"
            >
              <Tooltip
                content={forceUpdate === 0 ? 'Copy' : 'Copied'}
                direction="top"
                dynamic
                delay={200}
                status={forceUpdate}
              >
                <img src="/copy.svg" alt="copy icon" />
              </Tooltip>
            </span>
            <button
              type="button"
              className="btn-close"
              data-bs-dismiss="modal"
              aria-label="Close"
            />
          </div>
          <div className="modal-body">
            {response ? (
              <pre id="jsonViewer">
                {response && (
                  <DynamicReactJson
                    src={filteredJson}
                    collapsed={1}
                    name="response"
                    displayDataTypes={false}
                    enableClipboard={false}
                    style={{ color: '#C8501E' }}
                  />
                )}
              </pre>
            ) : (
              ''
            )}
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn tertiary-btn modal-btn"
              data-bs-dismiss="modal"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
export default DevTools
