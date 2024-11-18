import { getReactCondition, getReactDomCondition } from './react-validate'

export function ReactConditionUI() {
  return (
    <div>
      <p id="react-export-condition">{getReactCondition()}</p>
      <p id="react-dom-export-condition">{getReactDomCondition()}</p>
    </div>
  )
}

export function getReactConditionJson() {
  return {
    react: getReactCondition(),
    reactDom: getReactDomCondition(),
  }
}
