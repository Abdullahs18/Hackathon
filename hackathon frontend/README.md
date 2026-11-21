# Dastak frontend

React/TypeScript/Vite interface integrated with the FastAPI backend on `integration/fe-be`.
See [the combined application guide](../INTEGRATION.md) for startup, roles, Urdu voice,
permissions, retries, test boundaries and the live browser acceptance story.

From this directory:

```powershell
npm ci
$env:VITE_USE_MOCK = 'false'
$env:VITE_API_BASE_URL = 'http://localhost:8000'
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open http://localhost:5173 with the backend already running. Use the seeded account IDs
and your existing private demo password. Provider keys stay in backend configuration.

`npm run build` checks TypeScript and builds Vite. `npm run lint` runs the inherited Oxlint
configuration. `npm run test:e2e` runs browser acceptance against a disposable local backend
and synthetic providers; see the root guide for Python/browser prerequisites.

The shared contracts at the repository root are authoritative. Preserve saved versions,
explicit provider permission, scoped consent and final citizen authorization when editing
this client. Never synthesize a submission reference or automatically accept extracted facts.

