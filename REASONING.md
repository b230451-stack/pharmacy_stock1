# Implementation Reasoning

## Scope and Architecture

The project uses a deliberately small JavaScript stack: React and Vite for the client, Express for the API, MongoDB with Mongoose for persistence, and JWT plus bcryptjs for authentication. Business rules stay in the server because stock selection and quantity changes must not depend on frontend behavior.

The client uses a Vite development proxy so browser requests can use `/api` while the Express server remains on port 5000. The client keeps the JWT in local storage for the assessment workflow and sends it as a Bearer token on protected requests.

## Model Responsibilities

- `Medicine` stores the medicine identity and searchable details.
- `Batch` stores expiry, receipt, and remaining quantities. A batch number is unique per medicine.
- `StockMovement` records received stock and future stock adjustments.
- `DispensingTransaction` records the requested and dispensed quantity and the user who performed it.
- `DispensingAllocation` records the exact batches used by a dispensing transaction, including batch and expiry snapshots.

This separation makes the current stock easy to query while preserving the history of what happened.

## Sellable and Expired Stock

A batch is sellable only when both conditions are true:

```text
quantityRemaining > 0
expiryDate >= the start of today in UTC
```

Expired batches are excluded from sellable totals even when they still contain units. Depleted batches are also excluded. Expired batches with remaining units are returned separately by the expired-stock alert endpoint so they can be acted on.

Expiry dates are stored as MongoDB `Date` values. The server normalizes the comparison boundary to the start of the current UTC day, which keeps the behavior consistent across server and client environments.

## FEFO Dispensing

The dispensing service queries only eligible batches and sorts them by:

1. Earliest expiry date
2. Earliest received date
3. Batch ID as a deterministic tie-breaker

It calculates total eligible quantity before changing any batch. If the total is less than the request, it throws an insufficient-stock error with the available quantity. No batch, transaction, or allocation is written in that case.

When enough stock exists, the service consumes the requested quantity from the sorted batches. It uses the next batch when the current batch cannot satisfy the remaining quantity. Each decrement is conditional on the batch still having enough quantity, which protects against a concurrent change inside the transaction.

The batch updates, dispensing transaction, and allocation documents are written in one MongoDB transaction. If any part fails, the transaction is aborted so the stock and history do not become inconsistent. This is why the application requires a transaction-capable MongoDB deployment such as MongoDB Atlas or a replica set.

## Authentication Decisions

Registration validates the required fields, normalizes the email, rejects duplicate email addresses, and hashes the password with bcryptjs. Login explicitly selects the hidden `passwordHash`, compares the supplied password, and returns a one-day JWT. The auth middleware verifies the token, loads the current user, and attaches that user to the request.

Inventory routes are protected as a group. The public landing page and login/register screens remain accessible without a token.

## Error Handling

Controllers return clear client errors for missing fields, invalid quantities, missing medicines, duplicate records, invalid tokens, and insufficient stock. The Express error middleware converts Mongoose validation and duplicate-key errors into JSON responses instead of exposing the default HTML error page.

## Testing and Fixes

The implementation was checked with:

- Client `npm run lint`
- Client `npm run build`
- Server syntax checks and editor diagnostics
- An authenticated end-to-end API flow using temporary records

The FEFO flow test covered registration, login, `/me`, medicine creation and search, valid and expired batches, sellable stock totals, multi-batch dispensing, expiry alerts, and both history feeds. Temporary test records were deleted after the run.

During testing, several real compatibility or contract issues were found and fixed:

- Mongoose 9 validation hooks no longer supplied the callback used by the initial `Batch` and `DispensingTransaction` hooks. Those hooks were changed to synchronous validation functions.
- Mongoose 9 deprecated `new: true` for `findOneAndUpdate`; the service now uses `returnDocument: 'after'`.
- Mongoose 9 required `ordered: true` for the multi-document allocation insert inside a session.
- The alert endpoints initially returned `batches` while the client expected `items`. The responses were aligned with the common list response shape.
- The client lint rule caught synchronous state clearing inside React effects. Those updates were removed while preserving the asynchronous data loading behavior.

The current implementation intentionally does not claim supplier management, low-stock ordering, prescription integration, or other roadmap features that are not present in the code.