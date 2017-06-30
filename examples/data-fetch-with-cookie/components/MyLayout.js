import React from 'react'
import PropTypes from 'prop-types'
import Cookies from 'js-cookie'
import Router from 'next/router'

import Header from './Header'
import fetch from './fetch'

const layoutStyle = {
  margin: 20,
  padding: 20,
  border: '1px solid #DDD'
}

export default (Page)=>class Layout extends React.Component {  
  constructor(props) {
    super(props)
  }

  static propTypes = {
    children: PropTypes.any,
    user: PropTypes.object,
  }


  static async getInitialProps (ctx) {
    var myProp = await getMyProps(ctx)
    var pageProp = Page.getInitialProps?await Page.getInitialProps(ctx):{}
    return {
      ...myProp,
      ...pageProp,
    }

    async function getMyProps (ctx){
      const { req, res } = ctx
      var user = req?req.cookies.user:Cookies.get('user')
      if(user){
        user = JSON.parse(user)
        user.isGuest = false            
        return { user,}
      }else{
        return {
          user: {isGuest: true},
        }    
      } 
    }
  }

  

  render(){
    var props = {
        login: this.handleLogin.bind(this),
        logout: this.handleLogout.bind(this),
        ...this.props,
        ...this.state
    }
    return <div style={layoutStyle}>
      <Header {...props} />
      <Page {...props} />
    </div>
  } 

  handleLogin(username,passwd){
    var form = JSON.stringify({username,passwd})
    
    fetch('http://localhost/auth',{
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: form
    })
    .then(r=>r.json())
    .then((user)=>{
      if(user.error){
        return Promise.reject(user.error)
      }
      return user
    })
    .then((user)=>{      
      user.isGuest = false
      this.setState({user})
      Router.push('/index')
    })
    .catch((err)=>{
      console.log(err)
      alert(err)
    })    
  }

  handleLogout(){      
    this.setState({user:{
      isGuest: true,
    }})
    Cookies.remove('user')
    Router.push('/index')
  }
}


