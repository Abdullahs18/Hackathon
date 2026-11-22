export function validateDeploymentEnv(env: Record<string, string | undefined>) {
  if (env.VITE_DEPLOYMENT !== 'production') return;
  if (env.VITE_USE_MOCK !== 'false') throw new Error('Deployment requires VITE_USE_MOCK=false.');
  const url = new URL(env.VITE_API_BASE_URL || '');
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Deployment requires a public HTTPS API origin.');
  }
  for (const name of Object.keys(env)) {
    if (name.startsWith('VITE_') && /SECRET|PASSWORD|SERVICE_KEY|GEMINI.*KEY|DATABASE_URL/i.test(name)) {
      throw new Error('Server credentials must not use a VITE_ prefix.');
    }
  }
}
