
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { PageModule } from './page/page.module'

@Module({ imports: [PageModule] })
export class AppModule { }

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  await app.listen(3000)
}

bootstrap()
