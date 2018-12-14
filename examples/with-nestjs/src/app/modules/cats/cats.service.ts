import { Injectable } from '@nestjs/common';
import { Cat } from './interfaces/cat.interface';

@Injectable()
export class CatsService {
  private readonly cats: Cat[] = [];

  create(cat: Cat) {
    this.cats.push(cat);
  }

  findAll(): Cat[] {
    this.cats.push({
      name: 'Mufasa',
      age: 3,
      breed: '' 
    });
    return this.cats;
  }
}
