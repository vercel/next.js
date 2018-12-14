import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { ApplicationModule } from './src/app/app.module'
import * as bodyParser from 'body-parser'
import * as compression from 'compression'

const server = require('express')
// const next = require('next');

async function bootstrap () {
  const port = parseInt(process.env.PORT, 10) || 3000
  const dev = process.env.NODE_ENV !== 'production'

  // const nextApp = next({ dev });
  // const nextRequestHandle = nextApp.getRequestHandler();
  const expressServer = server()

  const nestApp = await NestFactory.create(ApplicationModule, expressServer)
  nestApp.use(bodyParser.json())
  nestApp.useGlobalPipes(new ValidationPipe())
  nestApp.use(compression())

  // await nextApp.prepare();
  // expressServer.get('*', (req, res) => {
  //   return nextRequestHandle(req, res)
  // });

  await nestApp.listen(port)
}

bootstrap()
