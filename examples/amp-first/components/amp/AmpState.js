import PropTypes from 'prop-types'
import React from 'react'
import { AmpIncludeAmpBind } from './AmpCustomElement'

/**
 * Renders an amp-state element, by either adding local state via `value`
 * or remote state via the `src` property.
 *
 * @param {Props} props
 */
export default function AmpState (props) {
  return (
    <>
      <AmpIncludeAmpBind />
      <amp-state id={props.id} src={props.src}>
        {props.value && (
          <script
            type='application/json'
            dangerouslySetInnerHTML={{ __html: JSON.stringify(props.value) }}
          />
        )}
      </amp-state>
    </>
  )
}

AmpState.propTypes = {
  id: PropTypes.string.isRequired,
  src: PropTypes.string,
  value: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number,
    PropTypes.object,
    PropTypes.array,
    PropTypes.bool
  ])
}
