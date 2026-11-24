# Dastak landing page

The public homepage implementation is grouped in this folder:

- `PublicHomePage.tsx`: bilingual homepage, shield illustration, navigation,
  page transitions, and calls to action.
- `SecurityCursor.tsx`: decorative spring-following shield and glow.

The existing `/` route imports a compatibility re-export from
`src/pages/PublicHomePage.tsx`. Login and authenticated workflows are unchanged.

This is a module of the existing app, not a standalone application. It uses
the project's React Router, Motion, Lucide icons, Tailwind theme, shared UI
components, language provider, and theme provider. No new dependencies or
backend services are required.

The cursor decoration keeps the native cursor, cannot intercept clicks,
disables on touch/coarse pointers and reduced-motion preferences, and removes
its listeners when leaving the homepage. It is a visual metaphor, not a claim
that mouse movement is being security-scanned.
