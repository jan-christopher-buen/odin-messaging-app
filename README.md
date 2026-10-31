# Signal Post

A thoughtful, text-only messaging app built for [The Odin Project’s Messaging App assignment](https://www.theodinproject.com/lessons/nodejs-messaging-app). A coral and slate interface keeps the conversation in focus, with a dedicated mobile inbox and chat view.

## Features

- Create an account, log in, restore a session, and log out.
- Find members by username and start private one-to-one conversations.
- Send plain text up to 4,000 characters, preserving line breaks.
- Refresh explicitly to retrieve new messages; load older messages in pages of 30.
- Keep unsent drafts while switching conversations, refreshing, or retrying a failed send.
- Edit a public display name and bio. Usernames are immutable.

Open two separate browser profiles, create accounts, search for the other username, and start a conversation. Send a message, then use **Refresh** in the recipient’s chat to retrieve it. Select your name at the bottom of the inbox to edit your profile.

## Stack and architecture

JavaScript, React 19, Vite, Express 5, Prisma 7 with the PostgreSQL driver adapter, PostgreSQL, Passport Local, and PostgreSQL-backed sessions. npm workspaces share one lockfile.

`client/src` contains the interface and same-origin API client. `server/src` separates app creation, authentication/session middleware, routes, and database access. Prisma migrations create users, ordered participant pairs, messages, and the session-store table. A database unique constraint prevents duplicate conversation pairs. Message IDs provide deterministic pagination; conversation ordering uses activity time and ID.

Passwords use bcrypt with a 72-byte maximum and a 10-character minimum. Authentication uses regenerated HttpOnly, SameSite=Lax session cookies rather than browser-stored tokens. Production cookies also require Secure. Every write requires a session-bound CSRF token and an exact allowed Origin. The API independently verifies participation and returns the same 404 for missing and inaccessible conversations. Public user responses contain only ID, username, display name, and bio.

## Run locally

Requires Node.js 24.12 or newer, npm, and a running PostgreSQL server. These commands assume the local `jc` role uses peer authentication through `/var/run/postgresql`; substitute your own local role if needed. No global PostgreSQL configuration changes are required.

```sh
createdb odin_messaging_app
createdb odin_messaging_app_test
npm ci
cp server/.env.example server/.env
cp server/.env.test.example server/.env.test
npm run db:generate
npm run db:migrate
cd server
DATABASE_URL='postgresql://jc@localhost/odin_messaging_app_test?host=/var/run/postgresql' npx prisma migrate deploy
cd ..
npm run dev
```

Open http://localhost:5173. The API listens on port 3000. Vite proxies `/api` without changing Origin, and forwards session cookies in both directions. Use `localhost` consistently rather than mixing it with `127.0.0.1`.

Environment variables in `server/.env`:

| Variable                | Purpose                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`          | Runtime PostgreSQL connection                                           |
| `DATABASE_URL_UNPOOLED` | Optional direct connection for migrations; falls back to `DATABASE_URL` |
| `SESSION_SECRET`        | At least 32 random characters; replace the example value                |
| `APP_ORIGIN`            | Exact browser origin, locally `http://localhost:5173`                   |
| `PORT`                  | API port, default 3000                                                  |
| `NODE_ENV`              | `development`, `test`, or `production`                                  |

Optional: `npm run db:seed` creates two fictional local development accounts and a conversation. The seed is restricted to the dedicated local development database. Credentials are confined to the seed source; never run it against a public deployment.

```sh
npm test             # API integration tests, then React behavior tests
npm run lint
npm run format:check
npm run format       # Apply project formatting
npm run build        # client/dist
npm run preview -w client # Stop Vite dev first; serve the build on port 5173
```

For preview mode, keep the API running with `npm start -w server` in another terminal. The preview server uses the same port and proxy as development.

API tests refuse cleanup unless the URL names the dedicated local test database and Unix socket. They delete only that database’s app data. Migrations must run against the test database before tests.

## Deployment preparation

No hosted resources are required for local use. See [deployment instructions](docs/deployment.md) for Neon PostgreSQL, Render API, and Vercel frontend setup, including the proxy and cookie verification required before release.

## Limitations

Messages require manual refresh. No WebSockets, presence, uploads, group chat, notifications, read receipts, account recovery, or email verification. Drafts live in memory and are cleared on logout or page reload. User search exposes intentionally public profile fields to signed-in members. Conversation lists are currently unpaginated; message history and user search are bounded. The process-local authentication rate limiter suits a single API instance; shared rate limiting is needed before horizontal scaling.

Typography: [DM Sans](https://fonts.google.com/specimen/DM+Sans) and [Manrope](https://fonts.google.com/specimen/Manrope), served by Google Fonts with system-font fallbacks.
