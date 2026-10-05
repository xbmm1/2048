# REST API

Base path: `/api/v1`. Responses are DTOs, not JPA entities. Collections return `{items, page, size, total}` with zero-based pages and size 1–100. There are no delete endpoints.

| Method | Path | Role / input |
| --- | --- | --- |
| GET | `/csrf` | Authenticated; current session token/header name |
| GET | `/members?q=&page=0&size=20` | Either role |
| GET | `/members/{id}` | Either role |
| GET | `/members/{id}/estimates` | Either role; paginated |
| POST | `/imports` | Staff; multipart field `file` |
| GET | `/imports` | Either role; paginated |
| GET | `/imports/{id}` | Either role; status/count |
| GET | `/imports/{id}/rows` | Either role; paginated row errors |
| POST | `/estimates` | Staff; `{memberId, asOf}` |
| GET | `/estimates/{id}` | Either role |
| POST | `/requests` | Staff; `{estimateId}` |
| GET | `/requests?status=SUBMITTED` | Either role; paginated |
| GET | `/requests/{id}` | Either role |
| POST | `/requests/{id}/submit` | Creator with staff role; `{version}` |
| POST | `/requests/{id}/review` | Independent approver; `{version, approve, comments}` |
| GET | `/audit` | Either role; paginated |
| GET | `/reports/estimates/{id}.pdf` | Either role; PDF |

Use form login and a session cookie. Obtain a fresh CSRF token after login because authentication rotates it. CSRF is intentionally enabled for REST writes as well as forms. API unauthenticated reads return 401; unauthorized writes or missing CSRF return 403. Validation uses 400 for malformed DTOs and 422 for business input rules; missing records return 404; stale or duplicate transitions return 409. Errors use `application/problem+json` and do not expose SQL.

## Run examples inside the signed-in browser

Open browser developer tools at `http://localhost:8080` after signing in as staff. Same-origin fetch sends the session cookie:

```javascript
const csrf = await fetch('/api/v1/csrf').then(r => r.json());
async function post(path, body) {
  const response = await fetch('/api/v1' + path, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', [csrf.headerName]: csrf.token},
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw result;
  return result;
}
const members = await fetch('/api/v1/members?q=Alex').then(r => r.json());
const estimate = await post('/estimates', {memberId: members.items[0].id, asOf: '2026-01-01'});
// Import the sample first so this estimate is eligible.
const request = await post('/requests', {estimateId: estimate.id});
await post(`/requests/${request.id}/submit`, {version: request.version});
```

After signing out and signing in as approver, run the helper again to get a fresh token, then:

```javascript
const queue = await fetch('/api/v1/requests?status=SUBMITTED').then(r => r.json());
const pending = queue.items[0];
await post(`/requests/${pending.id}/review`, {
  version: pending.version, approve: true, comments: 'Reviewed service and salary snapshot.'
});
```

CSV uploads use `FormData` and the same CSRF header; let the browser set the multipart boundary. Uploads are synchronous for this bounded example. A successful HTTP response may describe a **REJECTED** file: inspect the `status`, then fetch its rows. Re-uploading identical bytes returns the original import ID.

Dates use `YYYY-MM-DD`; CSV payroll months use `YYYY-MM`. Currency inputs accept decimal text with at most two fractional digits, no commas, exponents, or currency symbols. The as-of endpoint does not forecast future pay. Changing a request's version locally does not bypass state checks.
