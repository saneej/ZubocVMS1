export function cleanForFirestore(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  return JSON.parse(JSON.stringify(obj, (key, value) => {
    if (value === undefined) return undefined;
    return value;
  }));
}
