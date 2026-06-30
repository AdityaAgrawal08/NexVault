import { redis } from "../database/redis";

export interface GeoLocation {
  lat: number;
  lon: number;
  city: string;
  country: string;
}

class GeoVelocityService {
  private localCache = new Map<string, GeoLocation>();

  private getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the Earth in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  }

  public async getIpLocation(ip: string): Promise<GeoLocation> {
    const cleanIp = ip.trim();

    // 1. Loopback / Local IP Simulation
    if (cleanIp === "127.0.0.1" || cleanIp === "::1" || cleanIp === "localhost") {
      return { lat: 40.7128, lon: -74.006, city: "New York", country: "United States" };
    }

    // 2. Check local cache
    const cached = this.localCache.get(cleanIp);
    if (cached) return cached;

    // 3. Check Redis cache
    if (redis) {
      const redisCached = await redis.get(`geo:ip:${cleanIp}`);
      if (redisCached) {
        const parsed = JSON.parse(redisCached);
        this.localCache.set(cleanIp, parsed);
        return parsed;
      }
    }

    try {
      // 4. Fetch from public GeoIP API (ip-api.com is free and fast)
      const res = await fetch(`http://ip-api.com/json/${cleanIp}`);
      if (!res.ok) throw new Error(`GeoIP lookup failed: ${res.statusText}`);
      
      const data = (await res.json()) as any;
      if (data && data.status === "success") {
        const location: GeoLocation = {
          lat: data.lat,
          lon: data.lon,
          city: data.city || "Unknown",
          country: data.country || "Unknown",
        };

        // Cache the result (24 hours)
        this.localCache.set(cleanIp, location);
        if (redis) {
          await redis.set(`geo:ip:${cleanIp}`, JSON.stringify(location), "EX", 24 * 60 * 60);
        }

        return location;
      }
    } catch (err) {
      console.error(`[GeoVelocityService] Geolocation error for ${cleanIp}:`, err);
    }

    // Fallback default
    return { lat: 0, lon: 0, city: "Unknown", country: "Unknown" };
  }

  public async checkTravel(
    userId: string,
    sessionId: string,
    ipAddress: string
  ): Promise<{ allowed: boolean; speed?: number; distance?: number }> {
    const currentLocation = await this.getIpLocation(ipAddress);
    if (currentLocation.lat === 0 && currentLocation.lon === 0) {
      return { allowed: true }; // Fallback-safe: allow if geolocation fails
    }

    const key = `geo:session:${sessionId}`;
    const now = Date.now();

    // Retrieve previous location
    let previousDataStr: string | null = null;
    if (redis) {
      previousDataStr = await redis.get(key);
    }

    if (!previousDataStr) {
      // First request in session: save location and allow
      const data = {
        lat: currentLocation.lat,
        lon: currentLocation.lon,
        timestamp: now,
      };
      if (redis) {
        await redis.set(key, JSON.stringify(data), "EX", 7 * 24 * 60 * 60); // 7 days
      }
      return { allowed: true };
    }

    const previous = JSON.parse(previousDataStr);
    const distance = this.getDistance(previous.lat, previous.lon, currentLocation.lat, currentLocation.lon);
    const elapsedHours = (now - previous.timestamp) / (1000 * 60 * 60);

    if (distance > 50 && elapsedHours > 0) {
      const speed = distance / elapsedHours; // km/h
      
      // Commercial jet speed threshold: 800 km/h
      if (speed > 800) {
        return {
          allowed: false,
          speed: Math.round(speed),
          distance: Math.round(distance),
        };
      }
    }

    // Update location and timestamp
    const updatedData = {
      lat: currentLocation.lat,
      lon: currentLocation.lon,
      timestamp: now,
    };
    if (redis) {
      await redis.set(key, JSON.stringify(updatedData), "EX", 7 * 24 * 60 * 60);
    }

    return { allowed: true };
  }
}

export const geoVelocityService = new GeoVelocityService();
export type { GeoVelocityService };
