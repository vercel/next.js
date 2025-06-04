// @ts-nocheck
import { type NextRequest, NextResponse } from "next/server";

const geo = {
  city: 'London',
  country: 'United Kingdom',
  latitude: 51.5074,
  longitude: -0.1278,
  region: 'England',
  timezone: 'Europe/London',
} satisfies NextRequest['geo']
