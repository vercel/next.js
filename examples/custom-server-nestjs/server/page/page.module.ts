import { Module } from '@nestjs/common'
import { PageService } from './page.service'
import { PageController } from './page.controller'

const pageModule = {
  providers: [PageService],
  controllers: [PageController]
}

@Module(pageModule)
export class PageModule { }
