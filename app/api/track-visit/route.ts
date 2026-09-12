import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

function envBySuffix(suffix: string): string {
  const direct = process.env[suffix];
  if (direct) return direct;
  for (const [key, value] of Object.entries(process.env)) {
    if (value && key.endsWith(suffix)) return value;
  }
  return "";
}

export async function POST(req: Request) {
  try {
    const redis = new Redis({
      url: envBySuffix('KV_REST_API_URL') || envBySuffix('UPSTASH_REDIS_REST_URL'),
      token: envBySuffix('KV_REST_API_TOKEN') || envBySuffix('UPSTASH_REDIS_REST_TOKEN'),
    });

    const { lat, lng } = await req.json();
    
    const visit = {
      timestamp: Date.now(),
      lat: lat,
      lng: lng,
    };
    
    await redis.lpush('page-visits', visit);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving visit:", error);
    return NextResponse.json({ error: 'Failed to track visit' }, { status: 500 });
  }
}
