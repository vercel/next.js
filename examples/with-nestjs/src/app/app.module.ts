import { Module } from '@nestjs/common';
import { RenderModule } from 'nest-next';
import { CatsModule } from './modules/cats/cats.module';

@Module({
    imports: [RenderModule, CatsModule],
    providers: [],
})
export class ApplicationModule {}
