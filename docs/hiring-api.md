# Hiring API

Base URL: `/hiring`

Hiring Admin endpoints require the normal bearer token and accept the `Hiring Admin`, `Admin`, or `Super-Admin` role. Candidate endpoints use the application `reference` and opaque `trackingToken` returned by the application submission endpoint.

## Public and candidate endpoints

### Submit an application

`POST /hiring/applications`

```json
{
  "jobId": "senior-financial-analyst-6a683ef7f54f7d0975bb2eb1",
  "firstName": "Mira",
  "lastName": "Tan",
  "email": "mira@example.com",
  "phoneNumber": "91234567",
  "countryCode": "+65",
  "country": "Singapore",
  "city": "Singapore",
  "highestQualification": "Bachelor of Finance",
  "yearsOfExperience": 5,
  "currentRole": "Financial Analyst",
  "motivation": "At least 80 characters...",
  "consent": true,
  "resume": {
    "url": "https://res.cloudinary.com/.../resume.pdf",
    "publicId": "hiring/mira-tan/resume-...",
    "resourceType": "image",
    "format": "pdf",
    "bytes": 182000,
    "originalFilename": "mira-tan-resume.pdf",
    "originalBytes": 245000,
    "optimizedBytes": 182000,
    "compressionApplied": true
  },
  "introductionVideo": null
}
```

The response contains `reference` and `trackingToken`. The raw token is only returned once and must be stored by the client.

### Candidate workspace and progress

`POST /hiring/candidate/access` accepts `{ "email": "candidate@example.com" }` and always returns a neutral response. When matching applications exist, the candidate receives a six-digit OTP valid for five minutes. Requests for the same email are limited to one message per minute.

`POST /hiring/candidate/access/verify` accepts `{ "email": "candidate@example.com", "otp": "123456" }` and returns an eight-hour candidate session token. `GET /hiring/candidate/workspace?access=<candidateSessionToken>` returns every application associated with the verified email address.

`GET /hiring/candidate/workspace?reference=MAH-HR-2026-0001&token=<trackingToken>`

The token may instead be sent in the `x-hiring-token` header, which is preferred when the client is not using a tracking link.

Returns the candidate-visible stage history, scheduled/completed interviews, and published assignments. Internal notes, interview outcomes, marking guides, and reference answers are removed.

### Start or submit an assignment

- `POST /hiring/candidate/assignments/:id/start`
- `POST /hiring/candidate/assignments/:id/submit`

Start payload:

```json
{ "reference": "MAH-HR-2026-0001", "token": "<trackingToken>" }
```

Submit payload:

```json
{
  "reference": "MAH-HR-2026-0001",
  "token": "<trackingToken>",
  "answers": [
    { "questionId": "<questionId>", "selectedOption": "Sharpe ratio" },
    { "questionId": "<questionId>", "textAnswer": "Candidate response..." },
    {
      "questionId": "<questionId>",
      "attachments": [{
        "secureUrl": "https://res.cloudinary.com/.../submission.xlsx",
        "publicId": "hiring/mira-tan/assessments/...",
        "originalFilename": "submission.xlsx",
        "format": "XLSX",
        "bytes": 120000
      }]
    }
  ],
  "submissionNotes": "Optional note"
}
```

Assessment attachment signatures use `POST /cloudinary/hiring` with `assetType: "assessment_attachment"`, candidate name, MIME/extension, application reference, and tracking token.

## Hiring Admin endpoints

### Dashboard and applications

- `GET /hiring/dashboard`
- `GET /hiring/applications?page=1&limit=20&stage=&jobId=&search=&sort=newest`
- `GET /hiring/applications/:idOrReference`
- `PATCH /hiring/applications/:idOrReference/stage` — `{ "stage": "Screening" }`
- `PUT /hiring/applications/:idOrReference/review`
- `POST /hiring/applications/:idOrReference/notes` — `{ "body": "Private note" }`
- `GET /hiring/applications/:idOrReference/evaluation`
- `PUT /hiring/applications/:idOrReference/evaluation`

Evaluation criteria must total 100% and every score is manually entered from 1–5. Saving an evaluation never advances or rejects an application.

### Assignment library

- `POST /hiring/assignment-templates`
- `GET /hiring/assignment-templates`
- `GET /hiring/assignment-templates/:id`
- `PUT /hiring/assignment-templates/:id`
- `DELETE /hiring/assignment-templates/:id`

Supported question types are `mcq`, `explanation`, `case-study`, and `practical`. Rich-text fields accept HTML. MCQs require a private reference answer matching an option; practical questions require accepted file formats.

### Candidate assignments

- `POST /hiring/candidate-assignments`
- `GET /hiring/candidate-assignments`
- `PUT /hiring/candidate-assignments/:id`
- `PUT /hiring/candidate-assignments/:id/review`

Create payload:

```json
{
  "applicationReference": "MAH-HR-2026-0001",
  "templateId": "<publishedTemplateId>",
  "kind": "Assignment",
  "dueAt": "2026-08-10T12:00:00.000Z",
  "candidateInstructions": "Candidate-specific instructions",
  "status": "Published"
}
```

Review statuses: `Under review`, `Passed`, `Revision requested`, or `Not passed`. Scores and feedback are entered manually.

### Interviews

- `POST /hiring/interviews`
- `GET /hiring/interviews?from=&to=&status=&applicationId=`
- `PUT /hiring/interviews/:id`
- `DELETE /hiring/interviews/:id`

Interview notes, outcomes, preparation checks, and recommendations remain internal. Candidates only see scheduling details.

## Jobs

- `GET /jobs` — active openings
- `GET /jobs/:idOrSeoSlug` — active job detail
- Existing protected create/update/delete routes now allow the `Hiring Admin` role.

The job description stores the HTML produced by the shared Rich Text Editor and rejects empty markup.

## Candidate email notifications

Transactional hiring email is delivered through Resend for these manually triggered events:

1. Application received
2. Application progress updated
3. Interview scheduled
4. Interview rescheduled
5. Interview cancelled
6. Assignment assigned
7. Assignment deadline updated
8. Assignment submission received
9. Assignment revision requested
10. Assessment result available
11. Application successful
12. Application unsuccessful

Private notes, internal checklists, evaluations, interview notes, and assignment drafts never send candidate email.

Hiring Admin delivery operations:

- `GET /hiring/email-logs?status=&type=&applicationReference=&page=1&limit=20`
- `POST /hiring/email-logs/:id/retry`

Each candidate-visible event has a unique event key to prevent duplicate sends. Delivery failure is recorded without rolling back the hiring action. Failed deliveries can be retried manually.

Required configuration:

```dotenv
RESEND_API_KEY=
HIRING_EMAIL_FROM="Merlion Asset Holdings <noreply@send.merlionassetholdings.com>"
HIRING_EMAIL_REPLY_TO=careers@merlionassetholdings.com
HIRING_PORTAL_URL=https://www.merlionassetholdings.com/hiring
HIRING_ACCESS_SECRET=
```

`HIRING_ACCESS_SECRET` should be a long random secret used only for signed candidate tracking sessions. The service falls back to `JWT_SECRET` when it is not set.
