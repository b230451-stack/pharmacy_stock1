# InDate Pharmacy Stock

InDate is a React and Express pharmacy inventory application. It stores medicines and batches, calculates sellable in-date stock, highlights expiry risk, and dispenses stock using first-expiry-first-out (FEFO) rules.

## Stack

- Client: React, Vite, JavaScript, React Router
- Server: Node.js, Express.js
- Database: MongoDB with Mongoose
- Authentication: JWT and bcryptjs

## Prerequisites

- Node.js 18 or newer
- npm
- MongoDB running locally or a MongoDB Atlas connection

MongoDB must support transactions because FEFO dispensing updates stock and writes its audit records atomically. MongoDB Atlas supports this; a standalone local MongoDB server does not.

## Environment Setup

Create the server environment file:

```bash
cd server
cp .env.example .env
```

Set the values in `server/.env`:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/pharmacy_stock
JWT_SECRET=replace-with-a-long-random-secret
```

`JWT_SECRET` is used to sign and verify access tokens. Do not commit `server/.env` or real credentials.

## Install Dependencies

From the repository root:

```bash
cd server && npm install
cd ../client && npm install
```

## Run the Application

Start the backend:

```bash
cd server
npm run dev
```

The backend listens on `http://localhost:5000`. It connects to MongoDB before opening the HTTP port.

Start the frontend in a second terminal:

```bash
cd client
npm run dev
```

Vite normally serves the client at `http://localhost:5173`. The Vite development proxy sends `/api` requests to `http://localhost:5000`.

Useful client checks:

```bash
cd client
npm run lint
npm run build
```

## API Authentication

Register or log in to receive a JWT. Send it on protected requests with:

```http
Authorization: Bearer <token>
```

The inventory endpoints are protected. Authentication endpoints are public except for `/api/auth/me`.

## API Endpoints

The base URL is `http://localhost:5000/api`.

### Health

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | No | Check that the API is running |

### Authentication

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register` | No | Create a user and return a JWT |
| POST | `/auth/login` | No | Authenticate a user and return a JWT |
| GET | `/auth/me` | Yes | Return the current authenticated user |

Registration requires `name`, `email`, and a password of at least eight characters. Passwords are stored as bcrypt hashes.

### Medicines

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/medicines` | Yes | Search and list medicines with stock summaries |
| POST | `/medicines` | Yes | Create a medicine |
| GET | `/medicines/:medicineId` | Yes | Get medicine details and stock summary |
| PUT | `/medicines/:medicineId` | Yes | Update medicine details |
| DELETE | `/medicines/:medicineId` | Yes | Delete a medicine with no batches |
| GET | `/medicines/:medicineId/stock` | Yes | Get sellable and expired stock totals |

Medicine listing supports `search`, `page`, `limit`, `sortBy`, and `sortOrder` query parameters.

### Batches and Stock

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/medicines/:medicineId/batches` | Yes | Receive a stock batch and record a receipt movement |
| GET | `/medicines/:medicineId/batches` | Yes | List batches for a medicine |
| GET | `/batches/:batchId` | Yes | Get one batch and its medicine |
| POST | `/batches/import` | Yes | Import messy batch rows and return imported, deduped, and rejected counts |
| POST | `/clock` | Yes | Mark seven-day expiry batches and quarantine expired batches |
| GET | `/outbox` | Yes | List pending reorder notifications |

Batch listing supports `status=sellable|expired|depleted|all`, `page`, `limit`, `sortBy`, and `sortOrder`. Batches can have `ACTIVE`, `EXPIRING_SOON`, or `QUARANTINED` status. Quarantined batches cannot be dispensed.

The batch import endpoint accepts JSON rows with `medicineId` or medicine name, batch number, expiry date, and quantity. It handles null rows, quantities such as `"10 units"`, `dd/mm/yyyy` dates, ISO dates, and duplicate rows.

Medicines support an optional `reorderThreshold` field. When sellable in-date stock falls below that threshold, a pending reorder notification is created in the outbox. Pending notifications are deduplicated per medicine.

### Dispensing

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/dispensing` | Yes | Dispense using FEFO and record allocations |

The request body is:

```json
{
	"medicineId": "medicine-id",
	"quantity": 5,
	"reference": "optional-reference"
}
```

### Alerts and History

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/alerts/expiring` | Yes | List in-date batches expiring within `days` |
| GET | `/alerts/expired` | Yes | List expired batches with remaining stock |
| GET | `/history/dispensing` | Yes | List dispensing transactions and allocations |
| GET | `/history/stock` | Yes | List stock receipt and adjustment movements |

Alert and history lists support pagination with `page` and `limit`. The expiring alert endpoint also accepts `days`.

## Debugging Notes

- If the server exits before listening, check `MONGODB_URI` and confirm MongoDB is reachable.
- If registration or login fails while MongoDB is connected, check that `JWT_SECRET` is present in `server/.env`.
- A `401` response means the request is missing a valid `Authorization: Bearer <token>` header.
- A dispensing request that exceeds sellable stock returns an error and does not change batch quantities.
- `POST /api/clock` quarantines expired batches and marks batches expiring within the next seven days as `EXPIRING_SOON`.
- `/api/outbox` only returns pending reorder notifications. A notification is created when sellable stock is below the medicine's `reorderThreshold`.
- Batch import counts invalid or null rows as rejected and repeated existing or same-import batch keys as deduped.
- If the client cannot reach the API, confirm the backend is on port `5000` and that the Vite development server is running with the configured proxy.
- MongoDB transaction errors usually mean the database is running as a standalone server instead of a replica set or Atlas deployment.

## Current UI

The client includes a landing page, registration and login, dashboard, medicine search and creation, medicine details with batch receipt, dispensing with FEFO results, expiry alerts, and stock/dispensing history.