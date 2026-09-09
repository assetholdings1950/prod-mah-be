# Admin Email Center

The admin Email Center sends mail through Resend, stores conversation metadata in MongoDB, and records Resend delivery events. Only authenticated `Admin` and `Super-Admin` users can use its management endpoints.

## Required environment variables

```env
RESEND_API_KEY=re_...
EMAIL_SENDING_DOMAIN=send.merlionassetholdings.com
EMAIL_DEFAULT_FROM_PREFIX=onboarding
EMAIL_RECEIVING_DOMAIN=reply.merlionassetholdings.com
EMAIL_REPLY_TO=support@merlionassetholdings.com
RESEND_WEBHOOK_SECRET=whsec_...
```

`EMAIL_SENDING_DOMAIN` is fixed on the server. An admin may change only the local part, so entering `investor.relations` sends from `investor.relations@send.merlionassetholdings.com`. The domain must be verified in the same Resend account used by `RESEND_API_KEY`.

## Receiving replies

Use a dedicated subdomain such as `reply.merlionassetholdings.com` for Resend Receiving. This avoids replacing the MX records used by the organization's normal mailbox provider on the root domain.

1. Add and verify the receiving subdomain in Resend and publish the DNS records Resend provides.
2. Create a Resend webhook pointing to:

   `https://YOUR_BACKEND_HOST/email-center/webhooks/resend`

3. Subscribe it to `email.received` and the desired delivery events, including `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`, `email.suppressed`, and `email.failed`.
4. Put that webhook's signing secret in `RESEND_WEBHOOK_SECRET` and redeploy the backend.

Outbound messages use a unique reply address on the receiving subdomain. Replies received at that address are verified, fetched from Resend, and appended to the matching MongoDB conversation.

## Limits and storage

- The app accepts up to 50 recipients across To, CC, and BCC.
- Attachments are limited to 20 MB total and to PDF, Office, text, CSV, and common image formats.
- Message history, recipients, status, and attachment metadata are stored in MongoDB.
- Attachment contents remain in Resend and are accessed with short-lived download URLs; they are not duplicated in MongoDB.
- Raw inbound HTML is stored for recordkeeping, but the admin UI renders plain text to avoid executing untrusted email markup.
