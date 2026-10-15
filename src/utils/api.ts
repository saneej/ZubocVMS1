// Safe API helper that works across custom domains, webviews, and Safari iframes
export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : '/' + path;
  if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null') {
    return `${window.location.origin}${cleanPath}`;
  }
  return cleanPath;
}

export async function safeFetchJson(path: string, options: RequestInit = {}): Promise<any> {
  const url = getApiUrl(path);
  const response = await fetch(url, {
    ...options,
    headers: {
      'Accept': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    let errMsg = `HTTP ${response.status} ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson.error) errMsg = errJson.error;
    } catch {}
    throw new Error(errMsg);
  }

  return response.json();
}
