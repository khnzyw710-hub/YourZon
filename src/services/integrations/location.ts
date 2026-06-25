import * as Location from 'expo-location';

export interface ZonLocation {
  city: string;
  country: string;
  lat: number;
  lng: number;
}

let _lastLocation: ZonLocation | null = null;

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function getCurrentLocation(): Promise<ZonLocation | null> {
  const granted = await requestLocationPermission();
  if (!granted) return _lastLocation;

  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const [geo] = await Location.reverseGeocodeAsync({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    });

    _lastLocation = {
      city: geo.city ?? geo.district ?? geo.subregion ?? 'Unknown',
      country: geo.country ?? '',
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
    };
    return _lastLocation;
  } catch {
    return _lastLocation;
  }
}

export function getLastLocation(): ZonLocation | null {
  return _lastLocation;
}

export function formatLocationForContext(loc: ZonLocation): string {
  return `${loc.city}, ${loc.country}`;
}
