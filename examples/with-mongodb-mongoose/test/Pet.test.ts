import dbConnect from "../lib/dbConnect"
import { beforeAll, describe, it, expect, afterAll } from '@jest/globals';
import Pet from "../models/Pet";

describe('Pet', () => {
  beforeAll(async () => {
    await dbConnect()
  });

  it('should create a pet', async () => {
    const result = await Pet.create({
      name: "",
      owner_name: "",
      species: "",
      age: 0,
      poddy_trained: false,
      diet: [],
      image_url: "",
      likes: [],
      dislikes: [],
    })

    expect(result._id).toBeDefined();
  })
});