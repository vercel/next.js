import { NextResponse } from "next/server";
import { people } from "../../../data";
import { Person } from "../../../interfaces";

export async function GET(): Promise<NextResponse<Person[]>> {
  return NextResponse.json(people);
}
