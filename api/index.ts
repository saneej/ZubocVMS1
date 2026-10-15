let app: any;
try {
  // @ts-ignore
  app = (await import('../server.js')).default;
} catch (e) {
  // @ts-ignore
  app = (await import('../server.ts')).default;
}
export default app;
