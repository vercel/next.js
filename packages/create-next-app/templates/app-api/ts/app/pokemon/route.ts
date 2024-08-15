import { NextResponse } from "next/server";
import { withMiddleware } from "@/app/with-middleware";

export const GET = withMiddleware(async (request) => {
  const url = request.nextUrl.toString();

  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type");

  if (type && !POKEMON_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `Invalid type: '${type}'`, types: POKEMON_TYPES },
      { status: 400 },
    );
  }

  const res = await fetch(
    `https://api.vercel.app/pokemon${type ? `?type=${type}` : ""}`,
  );
  const data = await res.json();

  const pokedex = data.map((pokemon: { id: string }) => {
    return {
      ...pokemon,
      url: `${url}/${pokemon.id}`,
    };
  });

  return NextResponse.json(pokedex);
});

const POKEMON_TYPES = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
];
