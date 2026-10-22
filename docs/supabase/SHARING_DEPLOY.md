# PaceLab activity sharing deployment

1. Apply `003_activity_sharing.sql` in the Supabase SQL Editor.
2. Deploy the function from the repository root:

```bash
supabase functions deploy share-activity --project-ref oughcmukhohlmqcikbzu
supabase secrets set PUBLIC_SHARE_BASE_URL=https://<your-cloudflare-pages-domain> --project-ref oughcmukhohlmqcikbzu
```

3. Publish `apps/share-web` as a Cloudflare Pages static site. The site passes the `token` query parameter to the deployed Supabase function and only renders the sanitized snapshot returned by that function.

The mobile app creates an unguessable token through the authenticated function. Only its SHA-256 hash is stored in `activity_shares`; the raw token is returned once in the share URL. `DELETE` with `{ "shareId": "..." }` revokes a link. Expired and revoked links return 404 and never expose GPS points or account email.
