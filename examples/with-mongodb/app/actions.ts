'use server'

import clientPromise from "@/lib/mongodb"

export async function testDatabaseConnection() {
  let isConnected = false
  try {
    const client = await clientPromise
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!"); // because this is a server action, the console.log will be outputted to your terminal not in the browser
    return !isConnected
  } catch (e) {
    console.error(e)
    return isConnected
  }
}