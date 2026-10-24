# SafeReach Backend Documentation

**Project:** SafeReach Nigeria  
**Backend Version:** 1.0  
**Last Updated:** 22 October 2026  
**Live API:** https://safereach-api.onrender.com  
**Swagger Docs:** https://safereach-api.onrender.com/docs  
**Repository:** https://github.com/ezrakumo/safereach-backend

---

## 1. Overview

SafeReach is a personal safety backend API for emergency assistance, SOS alerts, trusted contacts, live tracking, safe check-ins, danger map reports, and user profile management.

The backend currently supports:

- Phone OTP authentication
- JWT authorization
- Emergency contacts
- SOS panic alerts
- Public SOS share links
- Live tracking during active SOS
- Safe check-ins with automatic missed-check-in alerts
- Community danger reports
- Report verification and flagging
- User profile endpoints
- FCM token storage for future push notifications
- Swagger API documentation
- Live deployment on Render

---

## 2. Live URLs

| Resource         | URL                                              |
| ---------------- | ------------------------------------------------ |
| Live API         | https://safereach-api.onrender.com               |
| Health Check     | https://safereach-api.onrender.com/api/v1/health |
| Swagger API Docs | https://safereach-api.onrender.com/docs          |

---

## 3. Technology Stack

| Layer             | Technology             |
| ----------------- | ---------------------- |
| Backend Framework | NestJS                 |
| Language          | TypeScript             |
| Runtime           | Node.js                |
| Database          | PostgreSQL             |
| ORM               | Prisma                 |
| Authentication    | JWT + Passport         |
| API Documentation | Swagger / OpenAPI      |
| Input Validation  | class-validator        |
| Scheduling        | @nestjs/schedule       |
| Security Headers  | Helmet                 |
| Local Database    | Docker PostgreSQL      |
| Cloud Database    | Neon PostgreSQL        |
| Hosting           | Render                 |
| SMS               | Dev-mode SmsService    |
| Push Notification | FCM token storage only |

---

## 4. Architecture

````text
Mobile App / Web Client
        |
        | HTTPS + JWT
        v
NestJS API on Render
        |
        | Controllers
        v
Services
        |
        | PrismaService
        v
PostgreSQL Database on Neon

---

## 2. Add a short changelog file

This helps you document changes periodically.

Run:

```powershell
@'
# SafeReach Backend Changelog

This file tracks important backend changes over time.

---

## 2026-10-22 — Version 1.0

### Added
- Phone OTP authentication
- JWT login
- Emergency contacts
- SOS panic alerts
- Public alert share links
- Live tracking
- Safe check-ins
- Missed check-in watchdog
- Danger map reports
- Report verification and flagging
- User profile endpoints
- FCM token storage
- Account deletion and anonymisation
- Swagger API documentation
- Render deployment
- Neon PostgreSQL database

### Deployment
- API deployed to Render
- Database deployed to Neon
- Swagger available at `/docs`
- Health check available at `/api/v1/health`

### Known limitations
- Real SMS not enabled
- Firebase push not enabled
- Render free tier sleeps
- Admin dashboard not built
- Rate limiting not currently active

---

## Documentation Rules

Update this changelog whenever:
- A new feature is added
- A bug is fixed
- An endpoint changes
- Prisma schema changes
- Deployment configuration changes
- Security behavior changes
- Production environment changes
| Set-Content -Path .\docs\CHANGELOG.md -Encoding UTF8
````
