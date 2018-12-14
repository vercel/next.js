import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { ApplicationModule } from './src/app/app.module'
import * as bodyParser from 'body-parser'
import * as compression from 'compression'
import { RenderModule } from 'nest-next';

async function bootstrap() {
  const port = parseInt(process.env.PORT, 10) || 3000;
  const nestApp = await NestFactory.create(ApplicationModule)

  nestApp.setGlobalPrefix('api');
  nestApp.use(bodyParser.json())
  nestApp.useGlobalPipes(new ValidationPipe())
  nestApp.use(compression())

  const next = require('next');
  const dev = process.env.NODE_ENV !== 'production'
  const nextApp = next({ dev });
  await nextApp.prepare();

  const renderer = nestApp.get(RenderModule);
  renderer.register(nestApp, nextApp);

  await nestApp.listen(port)
}

bootstrap()
