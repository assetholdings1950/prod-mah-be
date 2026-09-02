# Merlion Asset Holdings Backend

Backend API for the Merlion Asset Holdings (MAH) investment platform. It serves the client and admin Next.js applications and manages authentication, KYC, users, agents, wallets, deposits, withdrawals, investment plans, portfolios, SIP payments, payouts, reporting, notifications, and scheduled processing.

## Contents

1. [System overview](#system-overview)
2. [Technology stack](#technology-stack)
3. [Project structure](#project-structure)
4. [Getting started](#getting-started)
5. [How the application starts](#how-the-application-starts)
6. [Request and authentication lifecycle](#request-and-authentication-lifecycle)
7. [User types and permissions](#user-types-and-permissions)
8. [Core business workflows](#core-business-workflows)
9. [Scheduled jobs](#scheduled-jobs)
10. [Data model guide](#data-model-guide)
11. [API guide](#api-guide)
12. [External services](#external-services)
13. [Error handling and operational notes](#error-handling-and-operational-notes)
14. [Development workflow](#development-workflow)
15. [Known limitations and cautions](#known-limitations-and-cautions)

## System overview

The MAH system is split into three applications:

```text
mah-client-fe  ─┐
                ├── HTTP/JSON ──> MAH-BE ──> MongoDB
mah-admin-fe   ─┘                    │
                                    ├── Resend / email
                                    ├── Cloudinary
                                    └── Currency conversion provider
```

This repository is the `MAH-BE` service. The server exposes Express routes directly. Both frontends also contain Next.js API routes that act as frontend-facing proxies to this backend.

At a high level:

- Clients register, verify their email, submit KYC, add wallets/bank details, deposit crypto, invest, and withdraw or claim funds.
- Agents register separately, complete agent KYC, and can be related to referred clients.
- Admins review KYC and financial requests, configure plans/payment methods, monitor portfolios, and view cron/activity records.
- Superadmins can perform destructive reset/delete operations and manually run supported cron jobs.

## Technology stack

- Node.js with CommonJS modules
- Express 5
- MongoDB and Mongoose 8
- JSON Web Tokens for access and refresh tokens
- `bcryptjs` for password hashing
- `node-cron` for scheduled jobs
- MongoDB transactions for financial state changes
- Resend and Nodemailer-based email utilities
- Cloudinary for uploaded media/documents
- Axios for external HTTP requests
- Mongoose pagination and aggregate pagination plugins

## Project structure

```text
MAH-BE/
├── index.js                  # Server entry point and route/cron startup
├── config/                   # Environment-backed configuration
├── connections/              # MongoDB connection
├── controller/               # HTTP request/response layer
├── query/                    # Database-oriented application logic
├── services/                 # Shared domain services
├── routes/                   # Express route declarations
├── models/                   # Mongoose schemas and models
├── middleware/               # Authentication, role, and permission checks
├── helpers/                  # Portfolio calculations and date helpers
├── cron/                     # Scheduled jobs and cron registry
├── emailTemplate/            # Transactional email renderer/sender
├── firebase/                 # Legacy/news Firebase synchronization
├── scripts/                  # Seeding, migration, export, and patch scripts
├── utils/                    # Activity logging, Cloudinary, referral helpers
└── errors/                   # Shared error middleware
```

### Layer responsibilities

The codebase generally follows this path:

```text
Route → Controller → Query/Service → Mongoose Model → MongoDB
```

- **Routes** declare URLs and attach authentication/role middleware.
- **Controllers** validate request-level inputs, call application logic, and format responses.
- **Queries** contain much of the CRUD behavior for users and finance modules.
- **Services** contain cross-cutting or larger workflows such as portfolios, JWTs, currency conversion, and email.
- **Models** define persistent state and indexes.

## Getting started

### Prerequisites

- Node.js compatible with the installed dependencies
- npm
- MongoDB replica set or MongoDB Atlas
- Resend API key for notification emails
- Cloudinary account for uploads

MongoDB transactions are used for wallet and portfolio operations. A standalone MongoDB server without transaction support is not sufficient for these workflows.

### 1. Install dependencies

```bash
npm install
```

### 2. Create the environment file

Create `.env` in the project root. Never commit real secrets.

```dotenv
PORT=5000
APP_NAME=Merlion Asset Holdings
MONGO_URL=mongodb+srv://USER:PASSWORD@HOST/DATABASE

JWT_SECRET=replace-with-a-long-random-secret
JWT_REFRESH_SECRET=replace-with-another-long-random-secret
JWT_EXPIRESIN=15m

RESEND_API_KEY=
HIRING_EMAIL_FROM="Merlion Asset Holdings <noreply@send.merlionassetholdings.com>"
HIRING_EMAIL_REPLY_TO=careers@merlionassetholdings.com
HIRING_PORTAL_URL=http://localhost:3000/hiring
ADMIN_EMAIL=admin@example.com
ADMIN_EMAIL_OG=
ADMIN_DASHBOARD_URL=http://localhost:3001

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Some legacy files use the misspelled CLOUDIONARY prefix.
CLOUDIONARY_CLOUD_NAME=
CLOUDIONARY_API_KEY=
CLOUDIONARY_API_SECRET=

# Optional mail transport variables used by older mail utilities.
ZOHO_USER=
ZOHO_PASS=

# Local cron scheduling defaults to UTC if this is omitted.
CRON_TIMEZONE=UTC

# Optional comma-separated DNS servers for MongoDB resolution.
MONGODB_DNS_SERVERS=
```

Check the source before removing apparently duplicated variables: both `CLOUDINARY_*` and the legacy misspelling `CLOUDIONARY_*` are referenced.

### 3. Start the backend

```bash
npm start
```

The current `start` script runs `nodemon index.js`. For production, use a process manager or run `node index.js` with production supervision.

### 4. Confirm startup

Open:

```text
GET http://localhost:<PORT>/
```

The root endpoint returns a backend-running message and version information.

## How the application starts

The startup sequence in `index.js` is:

1. Load configuration and middleware dependencies.
2. Create the Express application and HTTP server.
3. Enable JSON and URL-encoded request bodies.
4. Enable CORS with credentials.
5. Enable cookie parsing.
6. Enable file uploads with temporary files stored under `/tmp`.
7. Mount all API route groups.
8. Connect to MongoDB.
9. Start the HTTP server only after MongoDB connects.
10. Register and schedule the active cron jobs.

If MongoDB cannot connect, the HTTP server and cron jobs are not started.

### Mounted route groups

```text
/auth
/role
/clients
/agent
/investment-plans
/cloudionary
/payment-methods
/deposits
/transactions
/withdrawals
/dashboard
/contact
/currency
/countries
/portfolio
/plan-charges
/cron
/activity-logs
```

## Request and authentication lifecycle

### Access tokens

Protected endpoints use `middleware/auth.midleware.js`.

The middleware looks for an access token in this order:

1. `Authorization: Bearer <token>` header
2. `accessToken` cookie

After verification it places the following data on the request:

```js
req.user = {
  sub: payload.sub,
  email: payload.email,
  role: payload.role,
  model: "User" | "Agent" | "Client"
};
```

`model` is inferred from the JWT role and is used by deposits, withdrawals, wallets, and other polymorphic records to determine which user collection owns the record.

### Role authorization

`middleware/role.middleware.js` supports roles stored as:

- A string
- An array of strings
- An array of role objects containing `roleName` or `roleCode`

Route declarations should consistently use lowercase role names (`admin`, `superadmin`). Be careful when adding new routes because a few older declarations use different capitalization.

### Refresh and logout

Auth modules provide refresh endpoints to exchange valid refresh state for a new access token. Logout clears or invalidates the stored refresh state according to the relevant user type.

### OTP lifecycle

Registration generally follows:

```text
Register
→ Store user and OTP verification state
→ Email OTP
→ Verify OTP
→ Mark account verified
→ Allow normal sign-in
```

Clients, agents, and staff/user accounts have related but separate auth handlers and models.

## User types and permissions

### Client

- Registers through `/clients`
- Completes client KYC
- Owns bank details and crypto wallets
- Creates deposits and withdrawals
- Browses and purchases investment plans
- Owns portfolios and investment transactions
- Claims monthly interest, maturity value, or early-exit refunds

### Agent

- Registers and signs in through `/agent`
- Completes agent KYC
- Owns agent bank details and wallets
- Can be associated with referred clients

### Admin

- Reviews KYC
- Manages clients and agents
- Reviews deposits and withdrawals
- Manages payment methods and investment plans
- Views transactions, portfolios, dashboards, cron state, and activity logs

### Superadmin

- Has admin capabilities
- Can run supported cron jobs manually
- Can perform destructive delete-all and reset operations
- Should be used sparingly in normal workflows

## Core business workflows

## 1. Client onboarding and KYC

1. Client submits registration details to `POST /clients`.
2. Backend creates the client record and OTP verification state.
3. OTP is emailed to the client.
4. Client verifies through `POST /clients/verify-otp`.
5. Client signs in and receives JWT authentication state.
6. Client uploads/submits KYC through `POST /clients/submit-kyc`.
7. Admin reviews and approves or rejects KYC.
8. KYC status controls access to sensitive frontend investment flows.

KYC information includes identification documents, selfie/video evidence, remarks, timestamps, and the approving administrator.

## 2. Wallets and bank details

Wallet and bank records are stored separately from clients/agents and use:

- `userId`
- `userModel` (`Client`, `Agent`, or `User` where supported)

This avoids embedding mutable financial details in the main identity document.

The investment system currently supports these wallet currencies:

```text
BTC, ETH, USDT, SOL, TRX
```

## 3. Deposits

1. Authenticated user creates a deposit request.
2. Request is stored as pending.
3. Client/user and admin receive notifications.
4. Admin reviews the request.
5. Approval credits the appropriate wallet and creates/updates financial records.
6. Rejection records the decision without crediting the wallet.
7. Bulk approval/rejection is available to admins.

Destructive deposit cleanup is restricted, with delete-all reserved for superadmin.

## 4. Withdrawals

1. Authenticated user submits a withdrawal request.
2. Backend validates ownership and available funds.
3. The request remains pending for admin review.
4. Approval completes the financial workflow and records the transaction.
5. Rejection returns the request to a terminal rejected state without completing payout.
6. Notifications are sent for submission and decisions.

Financial updates should remain transactional so wallet state and request state cannot diverge.

## 5. Investment plan configuration

An investment plan contains:

- Name, slug, descriptions, and image
- Category: `monthly`, `lumpsum`, or `crypto`
- Minimum and maximum investment amount
- USD base currency
- Fixed or range ROI
- Monthly, quarterly, or maturity payout type
- Minimum and maximum duration
- Lock-in duration
- Early-exit penalty
- Risk level
- Terms, status, featured flag, and sort order

Plan charges are kept in a related collection and loaded during confirmation/claim workflows.

Current route protection for plan and charge mutations should be reviewed before exposing the backend directly; some older routes do not attach authentication middleware.

## 6. Investment confirmation and creation

Investment creation is deliberately split into two calls.

### Step A: Confirm/quote

`POST /portfolio/confirm`

1. Validate plan status, amount, duration, and payment currency.
2. Convert the USD amount into the selected crypto currency.
3. Create a short-lived quote with conversion rate/source.
4. Return calculated dates, returns, and charge information.
5. Do not modify any wallet or portfolio state.

Quotes currently expire after 10 minutes.

### Step B: Create portfolio

`POST /portfolio/create`

1. Revalidate quote expiry.
2. Reload and revalidate the active plan.
3. Confirm wallet existence and sufficient balance.
4. Determine `sip` or `lumpsum` mode from the plan category.
5. Calculate maturity and lock-in dates.
6. Create the first investment lot.
7. Capture an immutable `planSnapshot`.
8. Start a MongoDB transaction.
9. Atomically debit the wallet, create a transaction, create the portfolio, and update client statistics.
10. Send the investment confirmation notification.

The plan snapshot is critical: editing a plan later must not rewrite the contractual terms of an existing portfolio.

## 7. Portfolio and lot accounting

A portfolio is the client-level investment contract. Each payment is stored as a lot.

Each lot records:

- Installment/lot number
- USD principal
- Crypto currency and amount paid
- Conversion rate and source
- Wallet transaction reference
- Investment and maturity dates
- Monthly interest and expected return values
- Lot status

The portfolio summary aggregates:

- Total invested USD
- Expected and paid profit
- Current value
- Expected maturity value
- Total, active, and matured lot counts

## 8. SIP installment processing

For monthly plans, the first payment creates installment 1. SIP metadata records:

- Monthly amount
- Total installments
- Paid installments
- Missed installments
- Next due date
- Last paid date

### Manual SIP payment

`POST /portfolio/:id/pay-sip`

The service validates that the portfolio is a SIP with unpaid installments. A regular installment can be paid on or after its due date. A missed installment can be recovered immediately, including when the final miss paused the portfolio. Recovery increments the paid count, decrements the missed count without going below zero, and preserves the established billing date.

### Automatic SIP payment

The morning master cron runs auto-payment daily at 09:00 UTC after maturity processing and SIP reminders.

```text
Find active due SIPs
→ Try original payment wallet
→ Try supported fallback wallets
→ Sufficient balance
   → atomically debit, add transaction/lot, update portfolio and client
→ No wallet has sufficient balance
   → mark installment missed and advance scheduled due date
→ Database/payment processing error
   → do not deduct funds and do not mark installment missed
```

Concurrency checks prevent two workers from processing the same installment state. Future due dates advance from the scheduled due date rather than the actual processing time, preserving the billing cycle.

`cron/sipMissedInstallments.js` is retained as legacy code but is **not started from `index.js`**. Do not re-enable its midnight scheduler without redesigning the ordering. Running it before auto-payment advances due dates and can prevent auto-payment from seeing installments that should be processed.

## 9. Earnings, maturity, and early exit

### Monthly interest

Eligible monthly-payout portfolios can claim interest through `POST /portfolio/:id/claim-monthly`. The service calculates claimable earnings, converts the USD result to the requested crypto, credits the wallet, records an earning transaction, and updates paid profit.

### Maturity

The maturity cron marks eligible portfolios and lots as matured. The client then calls `POST /portfolio/:id/claim-maturity` to convert the final USD value into the selected crypto and credit the wallet.

### Early exit

`POST /portfolio/:id/early-exit` calculates:

```text
principal
+ eligible accrued earnings
- early-exit penalty
- configured plan charges
= net refund
```

The service converts the result to crypto, credits the wallet, closes the portfolio, stores a closure breakdown, creates the financial records, and notifies the client.

## Scheduled jobs

Active jobs are registered only after MongoDB connects.

| Master job | Schedule | Purpose |
|---|---:|---|
| `master_morning` | Daily at 09:00 UTC | Runs portfolio maturity → SIP reminder → SIP auto-payment sequentially. |
| `master_evening` | Daily at 21:00 UTC | Runs portfolio maturity only. |

Both schedules are fixed to UTC. `vercel.json` contains exactly two definitions so the project remains compatible with the Vercel Hobby cron limit.

Each scheduled master execution claims a MongoDB key composed of the UTC date and master name. MongoDB's primary-key constraint prevents a Vercel retry or a second serverless instance from executing the same slot twice. Manual superadmin runs bypass this scheduled key intentionally.

The morning master attempts every child job even if an earlier child fails. Its persisted cron result contains the status, duration, result, or error for each child. A partially failed morning run is logged as an error after all three jobs have been attempted.

### Cron manager

`cron/cronManager.js` maintains an in-memory registry with:

- Idle/running state
- Last run time and status
- Last result/error
- Duration and run count

Every execution is also persisted to `CronLog`. Scheduled master idempotency claims and their final outcomes are stored separately in `CronExecution`.

Admin endpoints expose status and logs. Superadmins can manually trigger either master job; manual runs are clearly marked and do not consume the daily scheduled execution key.

The in-memory running guard prevents overlap within one Node process. The `CronExecution` key prevents duplicate scheduled master slots across backend instances, while financial services retain their own database-level concurrency protection.

## Data model guide

### Identity and access

- `User`: staff/admin identity and permissions
- `Client`: investor identity, KYC, referral/agent relation, and investment totals
- `Agent`: agent identity, KYC, relationships, and statistics
- `Role`: role definitions and permission metadata
- `OtpVerification`: temporary verification state
- `Referals`: referral records (legacy spelling retained)

### Money and account details

- `UserWallet`: actual internal currency balance used by deposits, investments, claims, and withdrawals
- `WalletDetail`: external crypto wallet/address details
- `BankDetail`: bank account details
- `Transaction`: immutable-style financial event record
- `DepositRequest`: deposit approval workflow
- `WithdrawalRequest`: withdrawal approval workflow
- `PaymentMethod`: admin-configured deposit/payment instructions

Do not confuse `UserWallet` balances with `WalletDetail`. The first is the platform balance ledger; the second stores wallet details/addresses.

### Investments

- `InvestmentPlan`: master product definition
- `PlanCharges`: charges associated with a plan
- `ClientPortfolio`: purchased plan snapshot, SIP state, lots, summaries, dates, and closure data

### Operations

- `CronLog`: scheduled/manual job execution history
- `ActivityLog`: auditable administrator/agent actions
- `Country`: country and city reference data

## API guide

This section lists route families and their purpose. Consult each file under `routes/` for exact request bodies and query parameters.

### Authentication and staff: `/auth`

```text
POST   /auth/sign-in
POST   /auth/sign-up
POST   /auth/verify-otp
POST   /auth/resend-otp
POST   /auth/forgot-password
POST   /auth/refresh
POST   /auth/logout
POST   /auth/create-user
GET    /auth/get-user
POST   /auth/update
DELETE /auth/delete-users
POST   /auth/reset-password-by-admin
POST   /auth/submit-kyc
POST   /auth/approve-kyc
```

### Clients: `/clients`

Includes registration/auth, KYC submission and review, listing/detail/update/delete, bank details, wallets, bulk KYC actions, and superadmin resets.

Important routes:

```text
POST  /clients
POST  /clients/sign-in
POST  /clients/verify-otp
POST  /clients/submit-kyc
POST  /clients/approve-kyc/:id
POST  /clients/reject-kyc/:id
GET   /clients/:id
GET   /clients/:id/bank-details
GET   /clients/:id/wallets
```

### Agents: `/agent`

Includes agent auth/KYC, profile, listing/detail/update/delete, and agent bank/wallet management.

### Investment plans: `/investment-plans`

```text
POST   /investment-plans
GET    /investment-plans
GET    /investment-plans/:id
POST   /investment-plans/update
DELETE /investment-plans
```

### Plan charges: `/plan-charges`

```text
GET  /plan-charges/:planId
POST /plan-charges
```

### Portfolios: `/portfolio`

Client routes:

```text
POST /portfolio/confirm
POST /portfolio/create
GET  /portfolio/my
GET  /portfolio/:id
POST /portfolio/:id/pay-sip
POST /portfolio/:id/claim-maturity
POST /portfolio/:id/early-exit
POST /portfolio/:id/claim-monthly
```

Admin routes:

```text
GET    /portfolio/admin/list
GET    /portfolio/admin/payout-summary
GET    /portfolio/admin/detail/:id
PATCH  /portfolio/admin/:id/status
DELETE /portfolio/admin/:id
DELETE /portfolio/admin/client/:clientId
DELETE /portfolio/admin/delete-all
```

### Deposits: `/deposits`

Client/user routes create and list personal requests. Admin routes list, summarize, inspect, approve, reject, bulk-process, and delete requests.

### Withdrawals: `/withdrawals`

Client/user routes create and list personal requests. Admin routes list, summarize, inspect, approve, reject, bulk-process, and delete requests.

### Transactions: `/transactions`

```text
GET    /transactions/client
GET    /transactions/admin
GET    /transactions/admin/summary
GET    /transactions/admin/user-wallet
GET    /transactions/admin/fund-balances
PATCH  /transactions/admin/reset-fund-balances
DELETE /transactions/admin/user-transactions
DELETE /transactions/admin/delete-all
```

### Payment methods: `/payment-methods`

Authenticated users can fetch active methods. Admin routes create, list, fetch, update, toggle, and delete methods.

### Cron operations: `/cron`

```text
GET  /cron/status        # admin/superadmin
GET  /cron/logs          # admin/superadmin
DELETE /cron/delete-all  # superadmin; deletes history and execution locks
POST /cron/run/:name     # superadmin
GET  /cron/vercel/master/morning # Vercel + CRON_SECRET
GET  /cron/vercel/master/evening # Vercel + CRON_SECRET
```

### Supporting APIs

- `/dashboard/summary`: admin dashboard metrics
- `/activity-logs`: paginated audit history
- `/countries`: country reference data
- `/countries/cities`: city lookup
- `/currency/convert`: currency conversion
- `/cloudionary`: signed upload data
- `/contact`: public contact submission
- `/role`: role CRUD

## External services

### MongoDB

MongoDB is the source of truth. `MONGO_URL` is loaded through `config/app.config.js`. Optional custom DNS servers may be configured through `MONGODB_DNS_SERVERS`.

### Currency conversion

Investment, claim, and withdrawal flows convert between USD and supported cryptocurrencies using `convertCurrency`. A conversion result normally contains:

- Converted amount
- Rate
- Source
- Conversion timestamp where stored

Conversion calls can fail because of external network/provider issues. Financial operations should not be marked as insufficient balance when conversion or database processing fails.

### Email

`emailTemplate/sendNotificationMail.js` sends branded notification emails using Resend. Emails are used throughout onboarding, KYC, deposits, withdrawals, portfolios, SIPs, and payouts.

Cron emails are awaited so cron completion reflects email processing. Some portfolio notifications are intentionally fire-and-forget and are followed by `.catch(() => {})` so an email outage does not roll back an already-completed financial transaction.

### Cloudinary

Cloudinary is used for uploaded KYC documents, images, and plan media. The codebase contains both correctly spelled and legacy misspelled configuration names and route/file names.

## Error handling and operational notes

### HTTP errors

Controllers generally use `express-async-handler`. Services may throw objects such as:

```js
throw { status: 400, message: "Validation message" };
```

When adding new code, preserve the established response structure:

```json
{
  "status": false,
  "message": "Human-readable explanation"
}
```

### Financial atomicity

Wallet changes, transactions, portfolios, and client statistics must be changed in one MongoDB transaction whenever they represent one business event.

Never implement a financial flow in this order without a transaction:

```text
debit wallet → later create transaction → later update portfolio
```

A failure between those steps would corrupt financial state.

### Idempotency and concurrency

Before introducing retries or multiple workers:

- Add conditional updates based on the expected current state.
- Ensure the same request cannot debit twice.
- Use unique references or idempotency keys for externally retried requests.
- Remember that the cron registry is process-local.

### Logging

Cron executions are persisted. Activity logging exists for administrative actions. Avoid logging full JWTs, passwords, OTPs, KYC documents, or financial secrets.

The auth middleware currently logs partial authorization-header and cookie information. Review this behavior before production deployment.

## Development workflow

### Before changing code

1. Identify the route and its middleware.
2. Trace the controller into its query/service.
3. Inspect all models changed by the workflow.
4. Check whether the operation must be transactional.
5. Check client and admin frontend proxy routes for expected response shape.
6. Check cron jobs that may modify the same records.

### After changing code

At minimum run:

```bash
node --check path/to/changed-file.js
git diff --check
```

Then exercise the relevant endpoint against a safe development database and verify:

- HTTP status and response shape
- Database records
- Wallet balance before/after
- Transaction record
- Portfolio/request state
- Notification behavior
- Authorization for client, admin, and superadmin roles

### Useful scripts

```bash
npm start                  # Start with nodemon
npm run test:cron          # Run focused master-cron tests
npm run create-admin       # Create/seed an admin
npm run news               # Run legacy news migration
npm run export             # Run export script
npm run updateNews         # Update legacy news data
npm run updateNewsAuthor   # Update legacy news author data
```

Review scripts before running them, especially against production data.

## Known limitations and cautions

- The general `npm test` command is still a placeholder; the master cron has a focused suite available through `npm run test:cron`.
- Several legacy routes have incomplete or inconsistent authentication/role protection. Audit route middleware before public deployment.
- Role capitalization is not perfectly consistent in older route declarations.
- Manual cron overlap protection is process-local; scheduled master slots additionally use a persistent MongoDB execution key.
- Master cron schedules are fixed to UTC.
- Some notifications are intentionally fire-and-forget.
- The backend package/repository metadata still contains the older `tccc-be`/`TCCC-BE` naming.
- `cloudionary` is misspelled in several established file, route, and environment names; renaming requires coordinated frontend and deployment changes.
- Large JSON body limits and permissive CORS should be reviewed for production security.
- Some old Firebase/news migration code remains in the repository but is not part of the primary MAH investment workflow.

## Maintenance rule of thumb

For every financial feature, a developer should be able to answer these questions before merging:

1. Who is authorized to perform it?
2. Which wallet and user model owns the money?
3. Which records must change atomically?
4. What prevents duplicate processing?
5. What transaction/audit record proves the event happened?
6. What happens if currency conversion, email, or MongoDB fails?
7. Does a cron job touch the same record?
8. Do both frontends still understand the response?

If any answer is unclear, trace the entire route → controller → service/query → model flow before changing the code.
