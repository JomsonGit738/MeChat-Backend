# MeChat backend

## Environment

Copy `.env.example` to `.env` and configure:

- `DATABASE`: MongoDB connection string.
- `DNS_SERVERS`: optional resolver addresses used before an SRV lookup.
- `JWTSECRET`: long, randomly generated signing secret.
- `NODE_ENV`: `development` locally and `production` when deployed.
- `SEED_DEMO_USERS`: set to `true` only in local development to create the
  demo users below. The server refuses to seed them in production.
- `DEMO_USER_PASSWORD` and `DEMO_USER_1_*` through `DEMO_USER_3_*`: optional
  local demo credentials. Defaults are documented in `.env.example`.
- `GOOGLE_CLIENT_ID`: the Google Web OAuth client ID used by the frontend.
- `CLIENT_ORIGINS`: comma-separated, exact frontend origins. Example:
  `http://localhost:3000,https://chat.example.com`.

Do not add trailing slashes to `CLIENT_ORIGINS`.

## Run

```sh
npm install
npm start
```

The local API and Socket.IO server listen on `http://localhost:4000`.

## Local demo accounts

For a repeatable multi-user demo, set `SEED_DEMO_USERS=true` and start the
backend. Seeding is idempotent: existing accounts are not changed.

- `alice.demo@mechat.local`
- `bob.demo@mechat.local`
- `charlie.demo@mechat.local`

All three use `Demo123!`. Sign in as Alice in a normal window and Bob or
Charlie in a private window to test direct messages and groups.

## Atlas connection troubleshooting

If `mongodb+srv://` fails with `querySrv ECONNREFUSED` or `ETIMEOUT`:

1. In Atlas, open **Connect → Drivers**.
2. Turn off **SRV Connection String** and copy the standard `mongodb://`
   connection string into `DATABASE`. This bypasses local SRV DNS problems.
3. Under **Network Access**, add your current public IP address.
4. Ensure the local firewall/network permits outbound TCP ports 27015–27017.

Do not use `0.0.0.0/0` for production database access.

## Security behavior

- Google ID tokens are verified server-side against `GOOGLE_CLIENT_ID`.
- Local passwords are bcrypt-hashed; valid legacy plaintext logins are
  transparently upgraded.
- Legacy shared-password Google accounts cannot use password login.
- Sessions are short-lived, `HttpOnly` cookies.
- Production cross-site cookies are `Secure`, `SameSite=None`, and partitioned.
  Prefer same-site custom domains for the frontend and API where possible.
- CORS only permits `CLIENT_ORIGINS`.
- REST and Socket.IO chat access requires authenticated membership.
- Group mutations require server-verified administrator ownership.
- Helmet, body limits, and rate limits are enabled.
