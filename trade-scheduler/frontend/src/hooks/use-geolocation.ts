import { useState } from 'react';

export function useGeolocation() {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [suburb, setSuburb] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setLocation(coords);
        setLoading(false);
        setError(null);

        // Reverse geocode to suburb via backend
        try {
          const res = await fetch(
            `/api/geo/suburb?lat=${coords.lat}&lng=${coords.lng}`
          );
          if (res.ok) {
            const data = await res.json();
            setSuburb(data.suburb ?? null);
          }
        } catch {
          // silently ignore — suburb display is non-critical
        }
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  return { location, suburb, error, loading, requestLocation };
}
