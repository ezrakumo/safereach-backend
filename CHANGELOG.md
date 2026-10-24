# Changelog

All notable changes to the SafeReach backend are recorded here.
Format: newest entry on top. Every code change that alters behaviour MUST add an entry.

---

## [1.0.0] - 2026-10-22

First production deployment.

### Added
- Phone OTP authentication (send, verify, refresh, me) with JWT
- Emergency contacts CRUD (max 5, soft delete, phone normalisation)
- SOS alerts with recipients log, 2h auto-expiry, public share link via shareToken
- Live tracking: POST/GET /alerts/:id/track, owner-only, closed after resolve
- Safe check-ins with 30-second watchdog that raises CHECKIN_MISSED alerts
- Danger map reports with nearby search (Haversine), community verify and flag
- User profile: update, summary counts, FCM token store/clear, account deletion (anonymise)
- Swagger docs at /docs
- SmsService abstraction (dev-log mode, SMS_ENABLED=false)

### Infrastructure
- Deployed API to Render free tier: https://safereach-api.onrender.com
- Database on Neon Postgres (direct connection string)
- Node pinned to 20.18.0 (20.19.0 breaks build - ora cycle bug)
- Build switched to plain tsc; start runs prisma migrate deploy

### Removed
- @nestjs/throttler (ERR_REQUIRE_ESM under ESM) - rate limiting TODO
- Railway deployment attempts (CLI install blocked + platform outage)

### Known limitations
- SMS and push are dev-log only - no real notifications yet
- Render free tier sleeps; watchdog paused while asleep
- devOtp returned in responses while NODE_ENV=development
- REPORT_VERIFICATION_THRESHOLD=1 (testing value)

---

<!-- TEMPLATE - copy for each new entry:

## [x.y.z] - YYYY-MM-DD

### Added
-

### Changed
-

### Fixed
-

### Removed
-

-->
