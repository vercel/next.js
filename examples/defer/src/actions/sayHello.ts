"use server";

import helloWorld from "@/defer/helloWorld";

export async function sayHello(name: string) {
    const { id } = await helloWorld(name)
    // return the execution ID to the client components
    //  to enable polling
    return id
}