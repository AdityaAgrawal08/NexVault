let accessToken: string | null = null;

export const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || "http://localhost:3000";

function getDeviceFingerprint(): string {
  let fp = localStorage.getItem("device_fingerprint");
  if (!fp) {
    // Generate a secure, persistent device fingerprint
    const array = new Uint32Array(4);
    (window.crypto || (window as any).msCrypto).getRandomValues(array);
    fp = Array.from(array, dec => dec.toString(16).padStart(8, "0")).join("");
    localStorage.setItem("device_fingerprint", fp);
  }
  return fp;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

export async function apiRequest(url: string, options: RequestOptions = {}): Promise<any> {
  const fullUrl = url.startsWith("http://") || url.startsWith("https://")
    ? url
    : `${API_BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;

  const headers = new Headers(options.headers || {});
  headers.set("X-Device-Fingerprint", getDeviceFingerprint());

  if (accessToken && !options.skipAuth) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(fullUrl, {
    ...options,
    headers,
    credentials: "include", // Ensure cookies are sent and received
  });

  // Handle 401 Unauthorized (potential token expiration)
  if (response.status === 401 && !options.skipAuth && !fullUrl.endsWith("/refresh")) {
    try {
      const refreshHeaders = new Headers();
      refreshHeaders.set("X-Device-Fingerprint", getDeviceFingerprint());

      const refreshResponse = await fetch(`${API_BASE_URL}/refresh`, {
        method: "POST",
        headers: refreshHeaders,
        credentials: "include",
      });

      if (refreshResponse.ok) {
        const result = await refreshResponse.json();
        accessToken = result.data.accessToken;
        localStorage.setItem("user", JSON.stringify(result.data.user));

        headers.set("Authorization", `Bearer ${accessToken}`);
        const retryResponse = await fetch(fullUrl, {
          ...options,
          headers,
          credentials: "include",
        });
        
        const retryResult = await retryResponse.json();
        if (!retryResponse.ok) {
          const error = new Error(retryResult.message || "Request failed after token refresh.");
          (error as any).errors = retryResult.errors;
          throw error;
        }
        return retryResult;
      } else {
        clearSession();
        window.location.href = "/login";
        throw new Error("Session expired. Please log in again.");
      }
    } catch (err) {
      clearSession();
      window.location.href = "/login";
      throw err;
    }
  }

  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.message || "Request failed.");
    (error as any).errors = result.errors;
    throw error;
  }

  return result;
}

export function clearSession() {
  accessToken = null;
  localStorage.removeItem("user");
}
