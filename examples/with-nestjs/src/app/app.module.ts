import { Module } from '@nestjs/common';
import { CatsModule } from './modules/cats/cats.module';

@Module({
    imports: [CatsModule],
    providers: [],
})
export class ApplicationModule {}
