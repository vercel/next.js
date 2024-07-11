import dbConnect from "../lib/dbConnect"
import { beforeAll, describe, it, expect, afterAll } from '@jest/globals';
import Pet from "../models/Pet";

describe('Pet', () => {
  beforeAll(async () => {
    await dbConnect()
    await Pet.deleteMany({})
  });

  afterAll(async () => {
    const connection = await dbConnect();
    connection.disconnect();
  });

  it('should create a pet', async () => {
    const result = await Pet.create({
      name: "Rex",
      owner_name: "John",
      species: "Cat",
      age: 10,
      poddy_trained: false,
      diet: [],
      image_url: "https://www.google.com",
      likes: [],
      dislikes: [],
    })

    expect(result._id).toBeDefined();
  });
});