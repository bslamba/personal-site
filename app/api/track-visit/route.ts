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
    
    // NEW: Figure out the city name using a free mapping service
    let locationName = "Unknown Location";
    if (lat && lng) {
      try {
        const mapUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
        // The map service requires us to identify ourselves politely, so we use a custom User-Agent
        const res = await fetch(mapUrl, { headers: { 'User-Agent': 'NishuBirthdayApp/1.0' } });
        const data = await res.json();
        
        if (data && data.address) {
          const addr = data.address;
          // Look for the most accurate city/town name available
          const cityOrTown = addr.city || addr.town || addr.village || addr.suburb || addr.county || "Unknown";
          const state = addr.state || "";
          locationName = state ? `${cityOrTown}, ${state}` : cityOrTown;
        }
      } catch (mapError) {
        console.error("Could not find city name:", mapError);
      }
    } else {
      locationName = "Location Denied";
    }
    
    // Save the new locationName along with the coordinates
    const visit = {
      timestamp: Date.now(),
      lat: lat,
      lng: lng,
      locationName: locationName
    };
    
    await redis.lpush('page-visits', visit);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving visit:", error);
    return NextResponse.json({ error: 'Failed to track visit' }, { status: 500 });
  }
}
