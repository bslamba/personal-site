import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

// This connects to your database using the keys from your .env.local file
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

export async function POST(req: Request) {
  try {
    // This receives the latitude (lat) and longitude (lng) from the user
    const { lat, lng } = await req.json();
    
    // This packages the location with the exact current time
    const visit = {
      timestamp: Date.now(),
      lat: lat,
      lng: lng,
    };
    
    // This saves it into your database in a list called 'page-visits'
    await redis.lpush('page-visits', visit);
    
    // This tells the page everything worked perfectly!
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving visit:", error);
    return NextResponse.json({ error: 'Failed to track visit' }, { status: 500 });
  }
}
