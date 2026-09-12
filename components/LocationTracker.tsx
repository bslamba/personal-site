"use client";
import { useEffect } from 'react';

export default function LocationTracker() {
  useEffect(() => {
    if (typeof window !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          // The user clicked "Allow". Send coordinates to the receiver we just made!
          await fetch('/api/track-visit', {
            method: 'POST',
            body: JSON.stringify({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            }),
          });
        },
        async () => {
          // The user clicked "Block". We still log the visit, but leave coordinates blank.
          await fetch('/api/track-visit', {
            method: 'POST',
            body: JSON.stringify({ lat: null, lng: null }),
          });
        }
      );
    }
  }, []);

  // This component does its job silently in the background, so it doesn't draw anything on the screen.
  return null; 
}
