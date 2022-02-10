import next from 'next'
import { Injectable } from '@nestjs/common'
import type { Request, Response } from 'express'

@Injectable()
export class PageService {
  private nextApp = next({ dev: process.env.NODE_ENV === 'development' })
  private preparePromise: Promise<any> | null = null

  async handle(req: Request, res: Response) {
    if (this.preparePromise == null) {
      this.preparePromise = this.nextApp.prepare()
    }

    const handle = this.nextApp.getRequestHandler()
    await this.preparePromise
    handle(req, res)
  }
}
