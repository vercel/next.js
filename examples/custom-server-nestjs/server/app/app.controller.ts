import { Controller, Get, Req, Res } from '@nestjs/common'
import { AppService } from './app.service'
import { Request, Response } from 'express'

@Controller()
export class AppController {
  constructor(private appService: AppService) {}

  @Get('/')
  public async home(@Req() req: Request, @Res() res: Response) {
    await this.appService.handler(req, res)
  }

  @Get('_next*')
  public async assets(@Req() req: Request, @Res() res: Response) {
    await this.appService.handler(req, res)
  }
}
