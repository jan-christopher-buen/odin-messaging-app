# Deployment guide

This repository is prepared for a same-origin browser `/api` proxy. Do not point the frontend directly at a separate Render domain: that changes cookie and CSRF assumptions. No resources have been provisioned and no live addresses are configured.

## Database: Neon

Create a dedicated Neon project in the same region as the API. Use its TLS connection strings from the dashboard. Set `DATABASE_URL` to the pooled connection for application traffic and `DATABASE_URL_UNPOOLED` to the direct connection for Prisma migrations. Keep both server-side. See [Neon’s Prisma guide](https://neon.com/docs/guides/prisma) and [Prisma’s PostgreSQL adapter documentation](https://www.prisma.io/docs/orm/overview/databases/postgresql).

Run `npm run db:migrate` with the production migration environment before starting the API. The initial migration includes the `connect-pg-simple` session table and expiry index; runtime automatic table creation is disabled. Do not run the development seed. Back up data before future destructive migrations.

## API: Render

Create a Node web service from the repository, with repository root as working directory and Node 24.12+. Use:

- Build: `npm ci --include=dev && npm run db:generate`
- Pre-deploy: `npm run db:migrate` (or run this once from a trusted environment if the selected plan lacks pre-deploy commands)
- Start: `npm start -w server`
- Health check: `/health`

Set `NODE_VERSION=24.22.0` on Render (the locally verified Node release). Configure `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, a cryptographically random `SESSION_SECRET` of at least 32 characters, `NODE_ENV=production`, and `APP_ORIGIN=https://YOUR-FRONTEND-HOST`. Render supplies `PORT`. Keep one API instance with the current process-local login/signup limiter. Sessions and messages persist in PostgreSQL across API restarts.

The API trusts exactly one proxy hop, the immediate Render ingress, for HTTPS and client addressing. It does not blindly trust arbitrary forwarded chains. Verify the actual ingress topology before changing this. See [Express proxy guidance](https://expressjs.com/en/guide/behind-proxies.html) and [session cookie guidance](https://expressjs.com/en/resources/middleware/session.html).

## Frontend: Vercel

Use repository root as the Vercel project root, build command `npm run build`, install command `npm ci`, and output directory `client/dist`. Select Node 24.x for the frontend build. No database or session secrets belong in frontend variables.

Once the actual Render hostname exists, add this `vercel.json` at repository root, replacing the hostname. Keep `/api` in the destination because the Express routes include it:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://YOUR-API.onrender.com/api/:path*"
    }
  ]
}
```

This app has no client-side path routing, so no SPA fallback is needed. Do not enable rewrite caching. All API responses use `Cache-Control: no-store`. Vercel documents [external rewrites and forwarded headers](https://vercel.com/docs/routing/rewrites). It forwards original protocol/host/client-address information; the API uses the configured `APP_ORIGIN` for CSRF rather than trusting forwarded host as authorization.

The cookie deliberately has no Domain attribute and uses Path=/, HttpOnly, SameSite=Lax, and Secure in production, with the `__Host-signal` name. Through a transparent same-origin proxy, Set-Cookie is associated with the frontend host and subsequent `/api` requests send that host’s cookie. The CSRF token travels in JSON and `X-CSRF-Token`; the browser’s original Origin must reach Express unchanged. No permissive CORS configuration is needed.

## Release verification

Local Vite proxy behavior can be exercised before deployment, but local tests do not prove a hosted edge proxy’s behavior. Before publishing a hosted app:

1. In browser network tools, confirm `/api/session` sets a host-only Secure HttpOnly cookie with Path=/ and SameSite=Lax. Check that the response is not cached.
2. Confirm login replaces the session cookie, `/api/session` restores the user after reload, and logout invalidates the previous cookie.
3. Confirm cookie forwarding to Render and all Set-Cookie responses back to the browser. Do not inspect these through frontend JavaScript, which cannot read Set-Cookie.
4. Confirm the browser Origin survives the rewrite and matches `APP_ORIGIN`. A missing or different origin and missing/wrong CSRF token must return 403.
5. Confirm Render sees HTTPS through its immediate trusted proxy and sets Secure cookies. Check the actual client-address behavior before relying on IP limits at scale.
6. Use separate accounts to verify participant-only access and both directions of messaging. Check a direct API request without a valid session is rejected.

These hosted checks remain a release gate. If the edge proxy fails to preserve cookie/origin behavior, use a single-origin deployment: serve `client/dist` from Express on Render with `/api` mounted first, remove the Vercel proxy, and set `APP_ORIGIN` to that Render/custom origin. This avoids cross-site cookies; do not loosen SameSite or CSRF validation to mask a proxy failure.

Preview domains are intentionally not automatically trusted. Use one exact isolated preview origin and a separate preview database/secret/API, or test locally. Do not share production sessions with arbitrary previews.
