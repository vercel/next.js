export const button = {
  render: (props) => <button {...props} />,
  attributes: {
    type: {
      type: String,
    },
  },
}
const TYPE_MAP = {
  note: {
    color: '#8792a2',
  },
  caution: {
    color: '#d97917',
  },
  check: {
    color: '#000000',
  },
  warning: {
    color: '#ed5f74',
  },
}
export const callout = {
  render: ({ children, type, title }) => {
    return (
      <div
        className="callout"
        style={{
          backgroundColor: TYPE_MAP[type].color,
        }}
      >
        <h3>{title}</h3>
        {children}
      </div>
    )
  },
  description: 'Display the enclosed content in a callout box',
  children: ['paragraph', 'tag', 'list'],
  attributes: {
    type: {
      type: String,
      default: 'note',
      matches: ['check', 'error', 'note', 'warning'],
      description:
        'Controls the color and icon of the callout. Can be: "caution", "check", "note", "warning"',
    },
    title: {
      type: String,
      description: 'The title displayed at the top of the callout',
    },
  },
}
