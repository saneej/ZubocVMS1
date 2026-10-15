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
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'Accept': 'application/json',
        ...(options.headers || {})
      }
    });
  } catch (netErr: any) {
    throw new Error(`Network error connecting to API (${url}): ${netErr?.message || netErr}`);
  }

  const rawText = await response.text();
  let data: any = null;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch (e) {
    // If not JSON (e.g. HTML 500 page or plain text error)
    if (!response.ok) {
      throw new Error(rawText ? rawText.slice(0, 150) : `HTTP ${response.status} ${response.statusText}`);
    }
    return { ok: true, raw: rawText };
  }

  if (!response.ok) {
    let errMsg = `HTTP ${response.status} ${response.statusText}`;
    if (data && typeof data === 'object') {
      if (data.error) {
        errMsg = typeof data.error === 'string'
          ? data.error
          : (data.error.message || JSON.stringify(data.error));
      } else if (data.message) {
        errMsg = typeof data.message === 'string' ? data.message : JSON.stringify(data.message);
      }
    } else if (rawText) {
      errMsg = rawText.slice(0, 150);
    }
    throw new Error(errMsg);
  }

  return data;
}
