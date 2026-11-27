// Lightweight GPS pre-warming utility for Check-in (kept separate from SmartCheckInModal for optimal bundle splitting)

const MAX_ADDRESS_CACHE_ENTRIES = 200;

class BoundedAddressMap extends Map<string, string> {
  private readonly maxEntries: number;

  constructor(maxEntries: number = MAX_ADDRESS_CACHE_ENTRIES) {
    super();
    this.maxEntries = maxEntries;
  }

  set(key: string, value: string): this {
    if (super.has(key)) {
      super.delete(key);
    } else if (this.size >= this.maxEntries) {
      const oldestKey = this.keys().next().value;
      if (oldestKey !== undefined) {
        super.delete(oldestKey);
      }
    }
    return super.set(key, value);
  }
}

let globalCachedGPS: { coords: { latitude: number; longitude: number }; timestamp: number } | null = null;
export const globalAddressCache: Map<string, string> = new BoundedAddressMap(MAX_ADDRESS_CACHE_ENTRIES);

export const getCachedAddress = (key: string): string | undefined => globalAddressCache.get(key);
export const setCachedAddress = (key: string, address: string): void => {
  if (!key || !address) return;
  globalAddressCache.set(key, address);
};

export const getCachedCheckInGPS = () => globalCachedGPS;

export const setCachedCheckInGPS = (coords: { latitude: number; longitude: number }) => {
  globalCachedGPS = {
    coords,
    timestamp: Date.now()
  };
};

export const prewarmSmartCheckInGPS = () => {
  if (typeof window === 'undefined' || !navigator.geolocation) return;
  if (globalCachedGPS && Date.now() - globalCachedGPS.timestamp < 60000) return;
  try {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        globalCachedGPS = {
          coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
          timestamp: Date.now()
        };
      },
      () => {},
      { enableHighAccuracy: true, timeout: 4000, maximumAge: 60000 }
    );
  } catch {
    // ignore geolocation error
  }
};
