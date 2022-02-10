import { Controller, Get, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { PageService } from './page.service'

@Controller()
export class PageController {
  constructor(private readonly pageService: PageService) { }

  @Get('*')
  async handle(@Req() req: Request, @Res() res: Response) {
    await this.pageService.handle(req, res)
  }
}
