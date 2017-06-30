import Link from 'next/link'
import PropTypes from 'prop-types'

const linkStyle = {
  marginRight: 15
}


const Login = ()=>{
  return <Link href="/login">
    <a style={linkStyle}>Login</a>
  </Link>
}

const Logout = (props)=>{
  return <a style={linkStyle} href="###" onClick={props.logout}>{props.user.username} logout</a>
}

const Header = (props) => {
  return (
    <div>
        <Link href="/">
          <a style={linkStyle}>Home</a>
        </Link>
        <Link href="/about">
          <a style={linkStyle}>About</a>
        </Link>
        {(props.user && props.user.username)?<Logout {...props} />:<Login />}
    </div>
  )
} 



export default Header
