# Deployment guide

Signal Post runs on Neon Free, Render Free, and Vercel Hobby. The frontend is https://signal-post-rho.vercel.app and the API is https://signal-post-api.onrender.com. Neon and Render are in Singapore. The browser uses the frontend’s same-origin `/api` proxy; direct cross-site browser API requests are not supported.

## Database: Neon

Use the dedicated `signal-post` Neon project with PostgreSQL 17 in Singapore, separate from local development and test databases. For a separate installation, create a dedicated project in the same region as its API. Use its TLS connection strings from the dashboard. Set `DATABASE_URL` to the pooled connection for application traffic and `DATABASE_URL_UNPOOLED` to the direct connection for Prisma migrations. Keep both server-side and use `sslmode=verify-full` for explicit certificate and hostname verification. See [Neon’s Prisma guide](https://neon.com/docs/guides/prisma) and [Prisma’s PostgreSQL adapter documentation](https://www.prisma.io/docs/orm/overview/databases/postgresql).

Run `npm run db:migrate` with the production migration environment before starting the API. The initial migration includes the `connect-pg-simple` session table and expiry index; runtime automatic table creation is disabled. Do not run the development seed. Back up data before future destructive migrations.

## API: Render

Create a Node web service from the repository, with repository root as working directory and Node 24.12+. Use:

- Build: `npm ci --include=dev && npm run db:generate`
- Migrations: run `npm run db:migrate` from a trusted environment with the production direct connection before releasing schema changes. Render Free does not support pre-deploy commands.
- Start: `npm start -w server`
- Health endpoint: `/health`. The current service uses Render’s default TCP health check; verify the HTTP endpoint during release checks.

Set `NODE_VERSION=24.22.0` on Render (the locally verified Node release). Configure `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, a cryptographically random `SESSION_SECRET` of at least 32 characters, `NODE_ENV=production`, and `APP_ORIGIN=https://signal-post-rho.vercel.app`. Use the exact frontend origin for a separate installation. Render supplies `PORT`. Keep one API instance with the current process-local login/signup limiter. Sessions and messages persist in PostgreSQL across API restarts.

The API trusts exactly one proxy hop, the immediate Render ingress, for HTTPS and client addressing. It does not blindly trust arbitrary forwarded chains. Verify the actual ingress topology before changing this. See [Express proxy guidance](https://expressjs.com/en/guide/behind-proxies.html) and [session cookie guidance](https://expressjs.com/en/resources/middleware/session.html).

## Frontend: Vercel

Use repository root as the Vercel project root, build command `npm run build`, install command `npm ci`, and output directory `client/dist`. Select Node 24.x for the frontend build. No database or session secrets belong in frontend variables.

The checked-in `vercel.json` routes `/api` to the confirmed Render hostname. Keep `/api` in the destination because the Express routes include it:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://signal-post-api.onrender.com/api/:path*"
    }
  ],
  "headers": [
    {
      "source": "/api/:path*",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-store"
        },
        {
          "key": "x-vercel-enable-rewrite-caching",
          "value": "0"
        }
      ]
    }
  ]
}
```

This app has no client-side path routing, so no SPA fallback is needed. API rewrite caching is explicitly disabled in the project settings and by `x-vercel-enable-rewrite-caching: 0`. All API responses use `Cache-Control: no-store`. Vercel documents [external rewrites and forwarded headers](https://vercel.com/docs/routing/rewrites). It forwards original protocol/host/client-address information; the API uses the configured `APP_ORIGIN` for CSRF rather than trusting forwarded host as authorization.

The cookie deliberately has no Domain attribute and uses Path=/, HttpOnly, SameSite=Lax, and Secure in production, with the `__Host-signal` name. Through a transparent same-origin proxy, Set-Cookie is associated with the frontend host and subsequent `/api` requests send that host’s cookie. The CSRF token travels in JSON and `X-CSRF-Token`; the browser’s original Origin must reach Express unchanged. No permissive CORS configuration is needed.

## Release verification

Repeat these checks after authentication, proxy, or infrastructure changes. Use independent accounts and keep destructive integration tests restricted to the safeguarded local test database:

1. In browser network tools, confirm `/api/session` sets a host-only Secure HttpOnly cookie with Path=/ and SameSite=Lax. Check that the response is not cached.
2. Confirm login replaces the session cookie, `/api/session` restores the user after reload, and logout invalidates the previous cookie.
3. Confirm cookie forwarding to Render and all Set-Cookie responses back to the browser. Do not inspect these through frontend JavaScript, which cannot read Set-Cookie.
4. Confirm the browser Origin survives the rewrite and matches `APP_ORIGIN`. A missing or different origin and missing/wrong CSRF token must return 403.
5. Confirm Render sees HTTPS through its immediate trusted proxy and sets Secure cookies. Check the actual client-address behavior before relying on IP limits at scale.
6. Use separate accounts to verify participant-only access and both directions of messaging. Check a direct API request without a valid session is rejected.

These checks are a release gate for future changes. If the edge proxy fails to preserve cookie/origin behavior, use a single-origin deployment: serve `client/dist` from Express on Render with `/api` mounted first, remove the Vercel proxy, and set `APP_ORIGIN` to that Render/custom origin. This avoids cross-site cookies; do not loosen SameSite or CSRF validation to mask a proxy failure.

Preview domains are intentionally not automatically trusted. Use one exact isolated preview origin and a separate preview database/secret/API, or test locally. Do not share production sessions with arbitrary previews.

## Free-plan operation

Render Free services spin down after inactivity and share the workspace’s included instance hours and build allowances. Neon also scales idle compute down. Expect cold starts; do not add keep-alive traffic to defeat free-plan sleeping. Review [Render’s free-plan limits](https://render.com/docs/free), [Neon pricing](https://neon.com/pricing), and [Vercel Hobby limits](https://vercel.com/docs/plans/hobby) before changing plans or scaling. No development seed runs during installation, builds, migrations, or server startup.
