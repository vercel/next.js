import { createHandler, Get, Param } from 'next-api-decorators'

class HelloHandler {
  @Get('/:myParam')
  // This fails due to library looking for Reflect.getMetadata("design:paramtypes", ...).
  // Design:paramtypes is never emitted due to missing SWC flag.
  async get(@Param('myParam') myParam) {
    return {
      myParam,
    }
  }
}

export default createHandler(HelloHandler)
