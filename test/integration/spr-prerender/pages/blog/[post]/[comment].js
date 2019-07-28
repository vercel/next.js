export const config = { experimentalPrerender: true }

const Comment = ({ time }) => <p>Current time: {time}</p>

Comment.getInitialProps = () => { time: new Date().getTime() }

export default Comment
