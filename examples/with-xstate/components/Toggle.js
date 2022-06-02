const Toggle = ({ onToggle, active }) => {
  return (
    <div>
      <h1>
        Toogle status: <span>{active ? 'On' : 'Off'}</span>
      </h1>
      <button onClick={onToggle}>Toggle</button>
    </div>
  )
}

export default Toggle
