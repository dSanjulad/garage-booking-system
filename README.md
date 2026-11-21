# GarageBookLK

A centralised garage booking website for Sri Lanka: compare independent garages by
price and verified reviews, see live availability, and book a bay. Built with
React (Vite), Node.js/Express and MySQL, as set out in the project report.

## Quick start

You need Node.js 18+ and MySQL 8.

```bash
# 1. API
cd backend
npm install
copy .env.example .env      # Windows (macOS/Linux: cp). Then set DB_PASSWORD and JWT_SECRET.
npm run db:fresh            # WARNING: deletes and rebuilds the database named in DB_NAME
npm run dev                 # http://localhost:8081

# 2. Website (second terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

`db:fresh` is required when upgrading from an earlier version, because the schema changed.

| Role | Email | Password |
|---|---|---|
| Vehicle owner | owner@example.com | password123 |
| Garage operator | kasun@colomboautoworks.lk | password123 |
| Admin | admin@garagebooking.lk | admin123 |

All garages, people and reviews created by the seed script are fictional demo data.

