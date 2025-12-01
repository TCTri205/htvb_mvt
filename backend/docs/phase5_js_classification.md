## Giai đoạn 5.1 – Phân loại JS theo Loại A/B

Đối với từng file JS vẫn còn chạy trên UI (vanthu/lanhdao/chuyenvien/quantri + helper chung), chúng ta phân biệt:

- **Loại A (data-grid, tra cứu, sub-resource)**: giữ lại các API JSON hiện tại (list, retrieve, attachments, comment, task, participant, config, …) vì chúng chưa được chuyển sang View MVT.
- **Loại B (workflow action)**: các nút workflow vẫn gọi POST đến API (`/submit`, `/publish`, `/assign`, `/pause`…); những endpoint này cần được dịch vào View MVT (forms + `WorkflowActionFormMixin`) và JS chỉ đóng vai trò gửi form thay vì gọi API trực tiếp.

| File | Loại A (giữ lại API) | Loại B (chuyển sang View MVT) |
|------|---------------------|-------------------------------|
| `backend/static/js/vanthu.js` | `api.documents.list` (danh sách văn bản đến/đi, kèm lọc/status/urgency), `api.documents.attachments` (attachments panel), `api.documents.versions`, `api.documents.dispatches`, `api.cases` (case list, tasks, logs), `api.registerBooks` / `api.numberingRules` (cấu hình). | `api.documents.publish` (phát hành văn bản đi) và `api.documents.recall`/`withdraw` (thu hồi); những action này hiển thị button ở trang chi tiết Văn thư (`data-doc-action="publish/recall"`). |
| `backend/static/js/lanhdao.js` | `api.documents.list` (trang danh sách Văn bản đến), tất cả lượt gọi chỉ lấy dữ liệu để hiển thị bảng/filters. | Không có workflow action trong file này → chỉ thuộc Loại A. |
| `backend/static/js/chuyenvien.js` | `api.documents.list` (Văn bản đi, dashboard), `api.cases.retrieve/tasks/activityLogs/documents` (chi tiết hồ sơ), `api.registerBooks`/`documents` (list config). | Vùng `initVanBanDiCreate` vẫn dùng `api.documents.create` / `.update` (save draft) và `.submit` (trình lãnh đạo); các nút `save draft`/`submit` nên gửi form tới `OutboundDraftView` / `OutboundDetailView` thay vì gọi API trực tiếp. |
| `backend/static/js/quantri.js` | `api.documents.list`, `api.cases.list` dùng cho tab tổng quan & KPI; vẫn cần giữ JSON để hiển thị data-grid quan trọng. | Không có action workflow (chỉ trình bày số liệu). |
| `backend/static/js/doc-workflow.js` | Wrapper dùng lại `/api/v1/inbound-docs/` (list, retrieve, import/export); pure Loại A để duy trì API side-list cho các tab nhúng. | ❌ N/A. |
| `backend/static/js/case-detail.js` | `api.cases.retrieve`, `api.cases.tasks`, `api.cases.participants`, `api.cases.activityLogs` (chỉ đọc). | ❌ N/A (action buttons trong templates sẽ gọi thư viện `workflow-actions.js` → cần chuyển sang submit form MVT). |

### Ghi chú
- Những endpoint workflow còn gọi trong `workflow-actions.js` (nút chung) cũng cần được cập nhật đồng thời: thay vì `WorkflowActionDispatcher` gọi API thì hãy để nó submit form ẩn (`workflow-action-form`) mà View MVT mới xử lý.
- Các action `cases.assign/start/pause/resume/request_close/approve_close/archive` hiện vẫn khởi từ JS (chưa inspect). Các điểm `data-action` dùng `workflow-action-form` đều nên tuân theo hướng mới, nhưng trong bước 5.1 chúng ta chỉ xác nhận `case-detail.js` là Loại A (fetch data) – action sẽ được đẩy vào `cases.views_ui.CaseDetailView`.
- `chuyenvien` và `vanthu` phải có view tương ứng xử lý POST (đã thực hiện ở GĐ4). Tập trung bước 5.2 chuyển JS để submit form thay vì gọi API.

Tài liệu này là đầu vào để bước tiếp theo (5.2) tái cấu trúc JS: giữ phần đọc dữ liệu (Type A) và biến các nút workflow thành submit form đến View MVT (Type B).
