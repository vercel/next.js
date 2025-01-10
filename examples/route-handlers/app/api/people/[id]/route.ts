import { NextResponse } from "next/server";
import { people } from "../../../../data";
import type { Person, ResponseError } from "../../../../interfaces";

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse<Person | ResponseError>> {
  const { id } = params;
  const person = people.find((p) => p.id === id);

  if (person) {
    return NextResponse.json(person);
  } else {
    return NextResponse.json(
      { message: `User with id: ${id} not found.` },
      { status: 404 },
    );
  }
}
