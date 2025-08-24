// @ts-nocheck
import { type NextRequest, NextResponse } from "next/server";

import type { Geo } from "@vercel/functions";

const geo = {
  city: 'London',
  country: 'United Kingdom',
  latitude: 51.5074,
  longitude: -0.1278,
  region: 'England',
  timezone: 'Europe/London',
} satisfies Geo
