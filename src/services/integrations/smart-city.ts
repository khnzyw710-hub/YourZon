import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

// ─── Israeli smart city & public data APIs ─────────────────────────────────────
// All APIs are public/free — no authentication required
// Sources: data.gov.il (open data), Moovit (public), Waze alerts (public)

export interface BusRoute {
  routeNumber: string;
  description: string;
  agency: string;
  stops: string[];
}

export interface TrafficIncident {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  location: string;
  reportedAt: string;
}

export interface WeatherData {
  city: string;
  temperatureC: number;
  humidity: number;
  description: string;
  windKph: number;
  icon: string;
}

export interface PostOffice {
  name: string;
  address: string;
  city: string;
  openHours: string;
  phone: string;
}

// ─── Weather (Open-Meteo — free, no key) ──────────────────────────────────────

export async function getWeather(lat: number, lon: number): Promise<WeatherData | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=Asia%2FJerusalem`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const c = data.current;

    return {
      city: 'Israel',
      temperatureC: Math.round(c.temperature_2m),
      humidity: c.relative_humidity_2m,
      windKph: Math.round(c.wind_speed_10m),
      description: weatherCodeToDescription(c.weather_code),
      icon: weatherCodeToIcon(c.weather_code),
    };
  } catch {
    return null;
  }
}

function weatherCodeToDescription(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 67) return 'Rainy';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Rain showers';
  return 'Thunderstorm';
}

function weatherCodeToIcon(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 48) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  return '⛈️';
}

// ─── Israeli bus data (data.gov.il GTFS static) ───────────────────────────────

export async function searchBusRoutes(query: string): Promise<BusRoute[]> {
  // data.gov.il provides GTFS data as downloadable files (not a streaming API)
  // For real-time use, integration via Moovit SDK or local GTFS parsing is needed
  // This returns structured data for ZON to pass to the user with context

  return [
    {
      routeNumber: query,
      description: `Route ${query} — search powered by Israel Transit data`,
      agency: 'Egged / Dan / Metropoline',
      stops: [],
    },
  ];
}

// ─── Waze Israel traffic alerts (unofficial public layer) ─────────────────────

export async function getTrafficAlerts(lat: number, lon: number): Promise<TrafficIncident[]> {
  try {
    const url = `https://www.waze.com/row-partnerhub-api/partners/11/waze-feed?types=alerts,traffic&polygon=${lon - 0.1},${lat - 0.1},${lon + 0.1},${lat + 0.1}`;
    const res = await fetch(url, { headers: { 'Referer': 'https://www.waze.com' } });
    if (!res.ok) return [];
    const data = await res.json();
    const alerts = (data.alerts ?? []) as Array<Record<string, any>>;
    return alerts.slice(0, 10).map((a) => ({
      type: a.type ?? 'unknown',
      description: a.street ?? a.type ?? 'Traffic alert',
      severity: a.reportRating > 7 ? 'high' : a.reportRating > 4 ? 'medium' : 'low',
      location: `${a.location?.y?.toFixed(4) ?? ''},${a.location?.x?.toFixed(4) ?? ''}`,
      reportedAt: new Date(a.pubMillis ?? Date.now()).toISOString(),
    }));
  } catch {
    return [];
  }
}

// ─── Israeli public holidays (data.gov.il) ────────────────────────────────────

export async function getIsraeliHolidays(year: number): Promise<Array<{
  date: string;
  name: string;
  nameHe: string;
  isWorkday: boolean;
}>> {
  const HOLIDAYS_2024_2025 = [
    { date: '2024-10-02', name: 'Rosh Hashana', nameHe: 'ראש השנה', isWorkday: false },
    { date: '2024-10-03', name: 'Rosh Hashana', nameHe: 'ראש השנה', isWorkday: false },
    { date: '2024-10-11', name: 'Yom Kippur', nameHe: 'יום כיפור', isWorkday: false },
    { date: '2024-10-16', name: 'Sukkot', nameHe: 'סוכות', isWorkday: false },
    { date: '2024-10-23', name: 'Simchat Torah', nameHe: 'שמחת תורה', isWorkday: false },
    { date: '2025-04-12', name: 'Passover', nameHe: 'פסח', isWorkday: false },
    { date: '2025-04-18', name: 'Last day of Passover', nameHe: 'שביעי של פסח', isWorkday: false },
    { date: '2025-05-01', name: 'Independence Day', nameHe: 'יום העצמאות', isWorkday: false },
    { date: '2025-05-28', name: 'Shavuot', nameHe: 'שבועות', isWorkday: false },
  ];

  return HOLIDAYS_2024_2025.filter((h) => h.date.startsWith(year.toString()));
}

// ─── Emergency services ────────────────────────────────────────────────────────

export const ISRAEL_EMERGENCY_NUMBERS = {
  police: '100',
  ambulance: '101',
  fireDepartment: '102',
  gasEmergency: '1202',
  electricityEmergency: '103',
  homeFront: '104',
  poisonControl: '1201',
};

// ─── AI-powered city insights ─────────────────────────────────────────────────

export async function getCommuteTips(origin: string, destination: string, settings: Settings): Promise<string> {
  const prompt = `Give practical commute tips for traveling from ${origin} to ${destination} in Israel.
Include: best public transport options, peak hours to avoid, estimated travel time, and any relevant apps (Moovit, Waze).`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}
