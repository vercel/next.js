const express = require('express')
const next = require('next')
const spdy = require('spdy')
const path = require('path')
const fs = require('fs')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare()
.then(() => {
  const server = express()
  server.use(bodyParser.urlencoded({ extended: true }))
  server.use(bodyParser.json())
  server.use(cookieParser())
  const user = {
    username: 'test',
    passwd: '123456',
    tempkey: 'tempkey',
  }
  
  //模拟登陆
  server.post('/auth', (req, res) => {
    if(req.body && req.body.username === user.username && req.body.passwd === user.passwd){
      res.cookie('user',JSON.stringify(user))
      res.header('custom-set-cookie',res.getHeader('set-cookie'))
      res.json(user)
    }else{
      res.json({error: 'wrong pass or no such account',body:req.body})
    }
  })

  //模拟登陆后才能用的接口
  server.get('/auth', (req, res) => {
    res.cookie('date',new Date())
    res.header('custom-set-cookie',res.getHeader('set-cookie'))
    var tuser = req.cookies.user
    tuser = tuser && JSON.parse(tuser)
    if(tuser && tuser.tempkey === user.tempkey && tuser.username === user.username){
      res.json(user)
    }else{
      res.json({error: 'not loged in',tuser})
    }
  })

  //next路由映射
  server.get('/p/:id', (req, res) => {
    const actualPage = '/post'
    const queryParams = { title: req.params.id } 
    app.render(req, res, actualPage, queryParams)
  })

  server.get('*', (req, res) => {
    return handle(req, res)
  })

  //使用http协议
  server.listen(80, (err) => {
    if (err) throw err
    console.log('> Ready http on http://localhost')
  })

  //使用http2协议
  spdy.createServer({
      key: fs.readFileSync(__dirname + '/server.key'),
      cert:  fs.readFileSync(__dirname + '/server.crt')
  }, server)
  .listen(433, (err) => {
    if (err) throw err
    console.log('> Ready http2 on https://localhost')
  })
})
.catch((ex) => {
  console.error(ex.stack)
  process.exit(1)
})