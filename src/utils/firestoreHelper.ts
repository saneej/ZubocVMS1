export function cleanForFirestore(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(cleanForFirestore);
  }
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      cleaned[key] = (val && typeof val === 'object' && !(val instanceof Date)) ? cleanForFirestore(val) : val;
    }
  }
  return cleaned;
}
