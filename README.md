# Armando al Pantheon — Cloudflare production project

This project preserves the existing homepage's visual design and adds dedicated menu/booking pages, a Cloudflare Worker API, and a serialized Durable Object booking coordinator. It is prepared for Cloudflare deployment; it is **not live until deployed to your Cloudflare account and configured with an admin secret**.

## Included

- `public/index.html` — original homepage/design with functional reservation submission.
- `public/menu.html` — separate responsive menu page in the same light cream/olive/gold visual language. Prices are deliberately shown as “Prezzo su richiesta” rather than invented.
- `public/prenota.html` — dedicated reservation page.
- `public/admin.html` — token-protected reservation management page; confirm/cancel requests.
- `src/index.js` — Worker API and Durable Object persistence/conflict guard.
- `wrangler.toml` — Worker static assets + Durable Object binding and SQLite-class migration.

## Reservation behavior

- Validates names, email, phone, party size, date, time and notes server-side.
- Rejects past dates, Sunday bookings, and unsupported time values.
- Persists reservation requests in Durable Object SQLite storage; status starts as `pending` and is **not represented to the customer as confirmed**.
- Checks overlapping two-hour dining windows and allows up to 14 active reservations in an overlapping window, matching the source site's stated 14-table room. The check and insert run in a synchronous SQLite transaction inside the coordinator to prevent concurrent double allocation beyond that capacity.
- Admin can confirm or cancel. Cancelling frees capacity. A confirmed booking cannot be resurrected from cancelled status.
- `GET /api/health` provides a lightweight health check.

## Deploy to Cloudflare

Requirements: Node.js 20+, a Cloudflare account, and permission to create Workers/Durable Objects.

```bash
npm install
npx wrangler login
# Create a strong unique secret. Do not commit it to source control.
npx wrangler secret put ADMIN_TOKEN
npm run check
npm run dev
```

Test locally at the URL printed by Wrangler, then deploy:

```bash
npm run deploy
```

After deployment:

- Public website: the Worker URL (attach a custom domain in Cloudflare when ready).
- Reservation admin: `/admin.html` and the secret configured as `ADMIN_TOKEN`.
- Health: `/api/health`.

Durable Object SQLite data persists in the Cloudflare environment; it is not stored in the visitor's browser. Use separate Cloudflare environments/secrets for staging and production.

## Before accepting real customers

1. Verify restaurant opening hours, closure days, booking duration, guest limit, and capacity with the business. The time options/14-table assumption mirror the provided source design and should be confirmed operationally.
2. The provided phone number is set to `+213674361675` as requested; verify that this is the restaurant's intended public contact number.
3. Email/SMS notifications are not configured because no mail/SMS provider credentials were supplied. Admin must review pending requests. Add a provider integration if automatic notifications are required.
4. Review the privacy notice and retention policy before collecting customer details; add a compliant privacy page and consent language appropriate to the business jurisdiction.
5. Run a live staging booking and concurrent-request test in your Cloudflare account before launch. This environment cannot deploy to your Cloudflare account or verify your account-specific configuration.

## Security and performance notes

- Admin API requires a secret bearer token; set it using Wrangler secrets, never in frontend code.
- API responses are not cached. Cloudflare serves static assets through its asset pipeline; browser caching/compression are handled by the platform defaults.
- Static pages include baseline security headers and a restrictive CSP. External font, Tailwind CDN, Lucide and image providers remain external dependencies in the original design. For stronger resilience/performance, vendor these assets locally and optimize large images to WebP/AVIF before launch.
- Add Cloudflare Turnstile/rate limiting if public abuse becomes an issue. Do not rely on client-side validation alone.
