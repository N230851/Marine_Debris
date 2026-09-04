import type { GeoLocation } from '@/types';

// Simulated survey coordinates — offshore survey areas
const SURVEY_AREAS: { name: string; lat: number; lng: number }[] = [
  { name: 'Pacific Survey Grid A-7', lat: 37.7749, lng: -122.4194 },
  { name: 'North Sea Survey Block 12', lat: 56.0, lng: 2.0 },
  { name: 'Gulf of Mexico Sector C', lat: 27.9, lng: -90.5 },
  { name: 'Mediterranean Grid M-3', lat: 38.5, lng: 15.0 },
  { name: 'Atlantic Shelf Survey D-1', lat: 42.3, lng: -65.5 },
];

const VESSELS = [
  'RV Nautilus',
  'SS Surveyor-1',
  'RV Atlantis',
  'USV SeaHawk-3',
];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function generateGeoLocation(fileName: string): GeoLocation {
  const seed = hashString(fileName + Date.now());
  const rng = seededRandom(seed);

  const area = SURVEY_AREAS[Math.floor(rng() * SURVEY_AREAS.length)];
  const latOffset = (rng() - 0.5) * 0.05;
  const lngOffset = (rng() - 0.5) * 0.05;

  return {
    latitude: Math.round((area.lat + latOffset) * 10000) / 10000,
    longitude: Math.round((area.lng + lngOffset) * 10000) / 10000,
    depth: Math.round(15 + rng() * 85),
    bearing: Math.round(rng() * 360),
    surveyVessel: VESSELS[Math.floor(rng() * VESSELS.length)],
  };
}

export function formatCoordinates(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`;
}
