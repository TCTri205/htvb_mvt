# Integration policy reference

The sections below capture how the current backend honors the integration policy, both to remind future reviewers and to flag the few places that still merit extra care.

## API base, docs, and UI surface
- `config/urls.py` wires the DRF router under `/api/v1/`, mounts `/api/v1/schema/`, `/api/v1/docs/` and `/api/v1/redoc/` (via `core.docs`), and keeps the HTML MVT routes such as `/vanthu/`, `/lanhdao/`, `/cases/` and `/admin/` separate from the API surface.

## Authentication & sessions
- `accounts/urls.py` exposes the JWT bundle `auth/jwt/create`, `auth/jwt/refresh`, `auth/jwt/verify`, and the `auth/me` profile endpoint plus `/auth/logout/`, `/auth/refresh/`, `/auth/change-password/` and the session-management endpoints.
- `accounts/api.py` writes an `AuthSession` record for every login, sets the `htvb_session_id` cookie, and now uses `accounts.session.revoke_session_for_request` so both logout and change-password revoke the presented session record.
- `accounts/session.py` centralizes the cookie/header parsing and revocation helper so we can keep the policy (logout/password changes revoke sessions) in sync.

## CORS & origin enforcement
- `config/settings.py` reads a trusted whitelist from `CORS_ALLOWED_ORIGINS` / regexes, and `core.middleware.ContractCorsMiddleware` returns the `{ detail, code: "CORS_FORBIDDEN" }` JSON body whenever `/api/` receives an unauthorized `Origin`.

## Pagination, filters, and sorting
- The API uses `core.pagination.DefaultPageNumberPagination` (custom envelope `items`, `total_items`, `total_pages`, `page`, `page_size` with `page_size` clamped ≤ 200).
- `documents/filters.py` supports the documented `q`, `status`, `doc_direction`, department/creator/assignee filters, `date_from`/`date_to`, `has_attachments`, `mine`, and an `ordering` field that currently replaces the policy’s proposed `sort=` parameter.
- `cases/filters.py` also exposes `q`, `status_id`, `department_id`, `leader_id`, etc., so the integration contract’s common filters remain within reach.

## Errors & standardized schema
- `common/schema.py` defines the `APIError` serializer (`detail`, `code`, `field_errors`), and `core.exceptions.contract_exception_handler` / `ContractAPIException` ensure every error response follows the policy. Specific scenarios like CORS, idempotency conflict, and concurrency preconditions already return the prescribed `code`.

## Idempotency & concurrency guarantees
- `common/idempotency.py` plus `common/models.IdempotencyKey` support the `Idempotency-Key` header lifecycle.
- `core/etag.py` generates weak ETags and `documents/views_base.py` enforces `If-Match`, returning `PRECONDITION_REQUIRED`/`PRECONDITION_FAILED` codes when needed.

## Uploads & downloads
- `cases/views.py` handles `POST /cases/{id}/attachments` with `multipart/form-data` (expects `file` plus a small metadata payload).
- `documents/views.py` exposes `/documents/{id}/attachments/{attachment_id}/download` and uses `FileResponse` so the client receives the appropriate `Content-Disposition` and MIME type from the stored attachment detail.

## OpenAPI / Swagger exposure
- `core/docs.py` and the Spectacular configuration provide `/api/v1/schema/`, `/api/v1/docs/`, `/api/v1/redoc/` plus legacy `/api/...` aliases that keep consumers guided by the latest versioned schema.

## Remaining considerations
- `cases/views.py` still exposes `@action` endpoints such as `/cases/{case_id}/assign`, `/cases/{case_id}/pause`, etc.; the policy prefers that status transitions happen exclusively through the HTML views, so it would be worth confirming whether these endpoints are still relied upon before removing them.

## Cases workflow & subresource APIs
- `GET /api/v1/cases/` delivers the paged envelope (`items`, `total_items`, `total_pages`, `page`, `page_size`) along with the usual filters. REST detail/edit/close/create routes have been removed (they now return 404/405), and all workflow transitions run exclusively through the HTML MVT routes (`/hosocongviec/taomoi/`, `/hosocongviec/{id}/`).
- The state machine at `/hosocongviec/{id}/` runs through `MOI_TAO` → `CHO_PHAN_CONG` → `DA_PHAN_CONG` (only the assigned Lãnh đạo can do this and an activity log is written) → `DANG_THUC_HIEN` (handled by the assignee) ↔ `TAM_DUNG` (and back to `DANG_THUC_HIEN` when resumed) → `CHO_DUYET_DONG` (requested by CV/owner) → `DONG` (approved by LD) → `LUU_TRU` (VT/QT or background job), with a `TAI_PHAN_CONG` branch for reassignments.
- Subresources stay exposed so clients can render participants, tasks, attachments, documents, activity logs, and comments. Guards now reflect the contract: `GET /api/v1/cases/{id}/participants` is viewable by case roles, while `PUT` overwrites participants and requires the assigned LD/QT; `/cases/{id}/watch` POST/DELETE keeps watcher roles; `GET /api/v1/cases/{id}/tasks` and `POST /api/v1/cases/{id}/tasks` allow CV/LD (CV defaults assignee=self unless an LD supplies `assignee_id`), `PATCH /api/v1/case-tasks/{task_id}/` allows the assignee or the case leader (only they may change `assignee_id`); `GET /api/v1/cases/{id}/attachments` and `POST /api/v1/cases/{id}/attachments` handle multipart uploads; `DELETE /api/v1/cases/{id}/attachments/{attachment_id}/`; `GET /api/v1/cases/{id}/documents` and `PUT /api/v1/cases/{id}/documents` (overwrite links by CV/LD/QT); plus the shared `GET /api/v1/comments`/`POST /api/v1/comments` and `DELETE /api/v1/comments/{id}` (comment author or QT).
- RBAC follows the updated matrix: only Lãnh đạo can assign or reassign case owners/assignees; CVs simply take the work and report progress, VT users focus on administrative support and do not assign; closing is proposed by CV/owner, approved by LD, archiving is done by VT/QT (or automated jobs) to push `DONG` to `LUU_TRU`; pause/resume/request-close now require the assignee/owner (or case leader where policy allows).
- Case deletion or recall is extremely restricted—QT/maintenance scripts alone should touch `DELETE /api/v1/cases/{id}/` and related maintenance endpoints unless policy explicitly changes.
