(function () {
  function onReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  function getDocId() {
    const meta = document.getElementById("doc-detail-meta");
    if (meta?.dataset?.docId) {
      return String(meta.dataset.docId).trim();
    }
    const params = new URLSearchParams(window.location.search);
    if (params.has("id")) {
      return params.get("id") || null;
    }
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    return pathParts.pop() || null;
  }

  function escapeHtml(value) {
    return (value || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(String(value).replace(/\.\d+Z$/, "Z"));
    if (Number.isNaN(date.getTime())) {
      const raw = String(value);
      return raw.slice(0, 10).split("-").reverse().join("/");
    }
    return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}/${date.getFullYear()}`;
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(String(value).replace(/\.\d+Z$/, "Z"));
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    return `${formatDate(date)} ${time}`;
  }

  function formatUser(user) {
    if (!user) return "—";
    if (typeof user === "string") return user;
    return user.full_name || user.name || user.username || "—";
  }

  // Use shared status handling from status-constants.js
  const OutboundStatusModule = window.OutboundStatus || {};
  const normalizeStatus = OutboundStatusModule.normalizeStatus || ((raw) => {
    console.warn("[VT] OutboundStatus module not loaded, using fallback");
    return "DRAFT";
  });

  function toArray(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.results)) return payload.results;
    return [];
  }

  const ATTACHMENT_EDITABLE_STATUSES = new Set([
    "PENDING_CLERK_CHECK",
    "REGISTERED",
    "ISSUED",
  ]);

  onReady(() => {
    const docId = getDocId();
    if (!docId) {
      console.warn("[vanthu] Thiếu ID văn bản đi.");
      return;
    }
    const api = window.ApiClient;
    const docApi = api?.documents;
    if (!docApi) {
      console.warn("[vanthu] Document API chưa sẵn sàng cho chi tiết văn bản đi.");
      return;
    }

    window.VTOutboundDetailOverride = true;
    let currentStatusKey = "DRAFT";

    const directionBadge = document.getElementById("doc-badge-direction");
    const urgencyBadge = document.getElementById("doc-badge-urgency");
    const statusBadge = document.getElementById("doc-badge-status");
    const titleEl = document.getElementById("doc-title");
    const summaryEl = document.getElementById("doc-summary");
    const metaNumber = document.getElementById("doc-detail-number");
    const metaCode = document.getElementById("doc-meta-code");
    const metaIssue = document.getElementById("doc-meta-issue");
    const metaIssued = document.getElementById("doc-meta-issued");
    const metaSignDate = document.getElementById("doc-meta-sign-date");
    const metaSigner = document.getElementById("doc-meta-signer");
    const metaSignMethod = document.getElementById("doc-meta-sign-method");
    const metaDepartment = document.getElementById("doc-meta-department");
    const metaPublisher = document.getElementById("doc-meta-publisher");
    const metaRecipients = document.getElementById("doc-meta-recipients");
    const assignmentsBody = document.getElementById("doc-assignments-body");
    const approvalsList = document.getElementById("doc-approvals");
    const approvalsCount = document.getElementById("doc-approval-count");
    const logsList = document.getElementById("doc-log-list");
    const attachmentsList = document.getElementById("doc-attachment-list");
    const dispatchList = document.getElementById("doc-dispatch-list");
    const dispatchNumberEl = document.getElementById("doc-dispatch-number");
    const dispatchDateEl = document.getElementById("doc-dispatch-date");
    const dispatchMethodEl = document.getElementById("doc-dispatch-methods");
    const versionsList = document.getElementById("doc-versions-list");
    const errorEl = document.getElementById("doc-detail-error");
    const workflowPanel = document.getElementById("doc-workflow-panel");
    const workflowTool = window.DocumentUIWorkflow;
    const attachmentForm = document.getElementById("vt-attachment-form");
    const attachmentInput = document.getElementById("vt-attachment-file");
    const attachmentSubmit = document.getElementById("vt-attachment-submit");
    const attachmentMessage = document.getElementById("vt-attachment-message");
    const commentList = document.getElementById("doc-comment-list");
    const commentForm = document.getElementById("vt-comment-form");
    const commentContent = document.getElementById("vt-comment-content");
    const commentMessage = document.getElementById("vt-comment-message");
    const commentApi = api?.comments;
    const commentEntityId = Number.parseInt(docId, 10);

    function showError(message) {
      if (!errorEl) return;
      errorEl.textContent = message;
      errorEl.classList.remove("hidden");
    }

    function clearError() {
      if (!errorEl) return;
      errorEl.textContent = "";
      errorEl.classList.add("hidden");
    }

    function updateAttachmentVisibility(status) {
      if (!attachmentForm) return;
      const canEdit = ATTACHMENT_EDITABLE_STATUSES.has(status);
      attachmentForm.classList.toggle("hidden", !canEdit);
      if (!canEdit) {
        showAttachmentMessage("", false);
      }
    }

    function showAttachmentMessage(text, isError) {
      if (!attachmentMessage) return;
      attachmentMessage.textContent = text || "";
      attachmentMessage.classList.toggle("text-rose-500", Boolean(isError));
      attachmentMessage.classList.toggle("text-emerald-600", Boolean(!isError && text));
    }

    // Log Event Modal
    const logEventBtn = document.getElementById("vt-log-event-btn");
    let logEventModalOverlay = null;

    function openLogEventModal() {
      // Close existing if any
      closeLogEventModal();
      
      logEventModalOverlay = document.createElement("div");
      logEventModalOverlay.className = "fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4";
      logEventModalOverlay.setAttribute("role", "dialog");
      logEventModalOverlay.setAttribute("aria-modal", "true");
      
      logEventModalOverlay.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4" onclick="event.stopPropagation()">
          <h3 class="text-lg font-semibold text-slate-800">Ghi sự kiện</h3>
          <form id="log-event-form" class="space-y-3">
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Loại sự kiện</label>
              <select name="event_type" required class="w-full rounded-md border border-slate-200 px-3 py-2 text-sm">
                <option value="">-- Chọn loại sự kiện --</option>
                <option value="receive">Tiếp nhận</option>
                <option value="process">Xử lý</option>
                <option value="transfer">Chuyển tiếp</option>
                <option value="complete">Hoàn thành</option>
                <option value="other">Khác</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Nội dung sự kiện</label>
              <textarea 
                name="description" 
                required
                rows="3"
                class="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                placeholder="Mô tả chi tiết sự kiện..."
              ></textarea>
            </div>
            <div class="flex gap-3 pt-2">
              <button type="submit" class="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium text-sm transition-colors">
                Lưu sự kiện
              </button>
              <button type="button" class="close-modal flex-1 h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium text-sm transition-colors">
                Hủy
              </button>
            </div>
          </form>
          <p id="log-event-message" class="text-sm hidden"></p>
        </div>
      `;
      
      document.body.appendChild(logEventModalOverlay);
      document.body.style.overflow = "hidden";
      
      // Bind events
      const form = logEventModalOverlay.querySelector("#log-event-form");
      form.addEventListener("submit", handleLogEventSubmit);
      
      logEventModalOverlay.querySelectorAll(".close-modal").forEach(btn => {
        btn.addEventListener("click", closeLogEventModal);
      });
      
      logEventModalOverlay.addEventListener("click", (e) => {
        if (e.target === logEventModalOverlay) closeLogEventModal();
      });
    }

    function closeLogEventModal() {
      if (logEventModalOverlay && logEventModalOverlay.parentNode) {
        logEventModalOverlay.remove();
        logEventModalOverlay = null;
        document.body.style.overflow = "";
      }
    }

    async function handleLogEventSubmit(event) {
      event.preventDefault();
      const form = event.target;
      const submitBtn = form.querySelector('button[type="submit"]');
      const messageEl = logEventModalOverlay.querySelector("#log-event-message");
      
      // Disable button
      submitBtn.disabled = true;
      submitBtn.textContent = "Đang lưu...";
      messageEl.classList.add("hidden");
      
      const formData = new FormData(form);
      const data = {
        event_type: formData.get("event_type"),
        description: formData.get("description"),
      };
      
      try {
        if (!api.documents.logEvent) {
            // Fallback if client not updated yet, though we just added it to backend
            // We might need to manually call fetch if the client lib isn't auto-generated
            // Assuming api.documents.logEvent exists or we use a direct fetch
             await fetch(`/api/v1/documents/${docId}/log-event/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": getCsrfToken(),
                },
                body: JSON.stringify(data)
            }).then(r => {
                if (!r.ok) throw new Error("Failed to log event");
                return r.json();
            });
        } else {
            await api.documents.logEvent(docId, data);
        }
        
        messageEl.textContent = "Đã ghi sự kiện thành công.";
        messageEl.className = "text-sm text-green-600 block";
        
        setTimeout(() => {
          closeLogEventModal();
          fetchLogs(); // Reload logs
        }, 1000);
      } catch (err) {
        console.error("[VT] Failed to log event:", err);
        messageEl.textContent = "Không thể ghi sự kiện. Vui lòng thử lại.";
        messageEl.className = "text-sm text-rose-600 block";
        submitBtn.disabled = false;
        submitBtn.textContent = "Lưu sự kiện";
      }
    }
    
    // Helper to get CSRF token if needed
    function getCsrfToken() {
        return document.querySelector('[name=csrfmiddlewaretoken]')?.value || 
               document.cookie.split('; ').find(row => row.startsWith('csrftoken='))?.split('=')[1];
    }

    if (logEventBtn) {
      logEventBtn.addEventListener("click", openLogEventModal);
    }

    // Keyboard support for modal
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && logEventModalOverlay) {
        closeLogEventModal();
      }
    });

    function renderDoc(doc) {
      clearError();
      if (!doc) {
        showError("Không tìm thấy dữ liệu văn bản.");
        return;
      }
      const normalizedStatus = normalizeStatus(
        doc.status?.code || doc.status?.name || doc.status || doc.state || doc.status_name
      );
      currentStatusKey = normalizedStatus;
      if (directionBadge) {
        directionBadge.textContent = doc.direction || "Văn bản đi";
      }
      if (urgencyBadge) {
        urgencyBadge.textContent = doc.important_level || doc.urgency?.name || "Thường";
      }
      if (statusBadge) {
         const statusMap = {
            DRAFT: "Dự thảo",
            SUBMITTED: "Đã trình lãnh đạo",
            PENDING_CLERK_CHECK: "Chờ văn thư kiểm tra",
            REGISTERED: "Đã vào sổ",
            ISSUED: "Đã phát hành",
            ARCHIVED: "Đã lưu trữ",
            HUY_PHAT_HANH: "Hủy phát hành",
         };
         statusBadge.textContent = statusMap[normalizedStatus] || "—";
      }
      if (titleEl) {
        titleEl.textContent = doc.title || doc.subject || "Văn bản đi";
      }
      if (summaryEl) {
        summaryEl.textContent =
          doc.summary || doc.note || doc.description || "—";
      }
      if (metaNumber) {
        metaNumber.textContent =
          doc.issue_number ||
          doc.document_code ||
          doc.document_id ||
          doc.id ||
          "—";
      }
      if (metaCode) metaCode.textContent = doc.document_code || "—";
      if (metaIssue) metaIssue.textContent = doc.issue_number || "—";
      if (metaIssued) metaIssued.textContent = formatDate(doc.issued_date || doc.created_at);
      if (metaSignDate) metaSignDate.textContent = formatDate(doc.sign_date || doc.presented_at);
      if (metaSigner) metaSigner.textContent = formatUser(doc.signer || doc.signer_id);
      if (metaSignMethod) {
        metaSignMethod.textContent =
          doc.sign_method || doc.signature_method || "—";
      }
      if (metaDepartment) {
        metaDepartment.textContent = doc.department?.name || doc.creator?.department?.name || "—";
      }
      if (metaPublisher) {
        metaPublisher.textContent = doc.publisher?.name || doc.sender || "—";
      }
      if (metaRecipients) {
        metaRecipients.textContent =
          (Array.isArray(doc.receivers) ? doc.receivers.join(", ") : "") ||
          doc.receiver ||
          doc.recipients ||
          "—";
      }
      updateAttachmentVisibility(normalizedStatus);
      mountWorkflow(doc);
    }

    function mountWorkflow(doc) {
      if (!workflowTool || !workflowPanel) return;
      const status = normalizeStatus(
        doc.status?.code || doc.status?.name || doc.status || doc.state || doc.status_name
      );
      const payload = {
        container: workflowPanel,
        docId,
        direction: "OUTBOUND",
        status,
        role: "VT",
        route: "vanbandi",
        allowWithdraw: false,
      };
      if (!window._vtWorkflowInstance) {
        window._vtWorkflowInstance = workflowTool.mount(payload);
        return;
      }
      if (typeof window._vtWorkflowInstance.update === "function") {
        window._vtWorkflowInstance.update(status);
      }
    }

    function renderAssignments(list) {
      if (!assignmentsBody) return;
      assignmentsBody.innerHTML = "";
      const items = Array.isArray(list) ? list : [];
      if (!items.length) {
        assignmentsBody.innerHTML =
          '<tr><td colspan="5" class="px-5 py-4 text-center text-sm text-slate-500">Chưa có phân công.</td></tr>';
        return;
      }
      items.forEach((item) => {
        const row = document.createElement("tr");
        const assignee = formatUser(item.user || item.assignee);
        const roleLabel = assignmentRole(item.role_on_doc || item.role);
        const assignor = formatUser(item.assigned_by);
        const dueText = formatDate(item.due_at || item.due_date);
        const statusText = item.active ? "Đang xử lý" : "Hoàn tất";
        row.innerHTML = `
          <td class="px-5 py-3">
            <div class="font-semibold text-slate-800">${escapeHtml(assignee)}</div>
            <div class="text-[12px] text-slate-500">${escapeHtml(roleLabel)}</div>
          </td>
          <td class="px-5 py-3">
            <span class="chip chip--blue">${escapeHtml(roleLabel)}</span>
          </td>
          <td class="px-5 py-3">${escapeHtml(assignor)}</td>
          <td class="px-5 py-3">${escapeHtml(dueText)}</td>
          <td class="px-5 py-3">
            <span class="chip chip--amber">${escapeHtml(statusText)}</span>
          </td>
        `;
        assignmentsBody.appendChild(row);
      });
    }

    function assignmentRole(role) {
      if (!role) return "Đã giao";
      const cleaned = role.toString().toLowerCase();
      if (cleaned.includes("chu_tri")) return "Chủ trì";
      if (cleaned.includes("phoi")) return "Phối hợp";
      if (cleaned.includes("watch")) return "Theo dõi";
      return role;
    }

    function renderApprovals(list) {
      if (!approvalsList) return;
      const items = Array.isArray(list) ? list : [];
      if (!items.length) {
        approvalsList.innerHTML =
          '<li class="text-[13px] text-slate-500">Chưa có quy trình trình ký.</li>';
        if (approvalsCount) approvalsCount.textContent = "0";
        return;
      }
      approvalsList.innerHTML = items
        .map((step) => {
          const approver = formatUser(step.approver || step.approver_id);
          const decision = step.decision || step.status || "Chưa quyết";
          const timestamp = formatDateTime(step.decided_at || step.updated_at);
          const note = step.note || step.comment || "";
          return `<li class="rounded-lg border border-slate-100 p-3 text-[13px]">
            <div class="flex items-center justify-between text-slate-700">
              <strong>${escapeHtml(step.type || step.step || "Duyệt")}</strong>
              <span class="text-[12px] text-slate-500">${escapeHtml(decision)}</span>
            </div>
            <p class="text-[13px] text-slate-500 mb-1">${escapeHtml(note)}</p>
            <div class="text-[12px] text-slate-400">Người thực hiện: ${escapeHtml(approver)} • ${escapeHtml(
              timestamp
            )}</div>
          </li>`;
        })
        .join("");
      if (approvalsCount) {
        approvalsCount.textContent = String(items.length);
      }
    }

    function renderLogs(list) {
      if (!logsList) return;
      const items = Array.isArray(list) ? list : [];
      if (!items.length) {
        logsList.innerHTML =
          '<li class="text-[13px] text-slate-500">Chưa có nhật ký xử lý.</li>';
        return;
      }
      logsList.innerHTML = items
        .map((entry) => {
          const actor = formatUser(entry.actor || entry.actor_id);
          const action = entry.action || entry.note || "Hoạt động";
          const time = formatDateTime(entry.acted_at || entry.created_at);
          const from = entry.from_status || entry.from_status_name || "";
          const to = entry.to_status || entry.to_status_name || "";
          return `<li class="rounded-lg border border-slate-100 p-3 space-y-1 text-[13px]">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-800">${escapeHtml(action)}</span>
              <span class="text-[12px] text-slate-500">${escapeHtml(time)}</span>
            </div>
            <p class="text-[12px] text-slate-500">${escapeHtml(entry.description || entry.note || "")}</p>
            ${from || to ? `<div class="text-[12px] text-slate-500">Từ ${escapeHtml(from)} → ${escapeHtml(
              to
            )}</div>` : ""}
            <div class="text-[12px] text-slate-400">Thực hiện bởi ${escapeHtml(actor)}</div>
          </li>`;
        })
        .join("");
    }

    function renderAttachments(list) {
      if (!attachmentsList) return;
      const items = Array.isArray(list) ? list : [];
      if (!items.length) {
        attachmentsList.innerHTML =
          '<li class="text-slate-500">Chưa có đính kèm.</li>';
        return;
      }
      attachmentsList.innerHTML = items
        .map((file) => {
          const name = file.name || file.filename || "Tệp đính kèm";
          const uploaded = formatDateTime(file.created_at || file.uploaded_at);
          let download = "#";
          if (file.id && typeof docApi.attachmentDownloadUrl === "function") {
            try {
              download = docApi.attachmentDownloadUrl(docId, file.id);
            } catch (err) {
              download = "#";
            }
          }
          return `<li class="rounded-lg border border-slate-100 p-3 flex items-center justify-between gap-3">
            <div>
              <div class="font-medium text-slate-700">${escapeHtml(name)}</div>
              <div class="text-[12px] text-slate-500">Tải lên: ${escapeHtml(
                file.uploader?.full_name || file.uploader?.name || "—"
              )} • ${escapeHtml(uploaded)}</div>
            </div>
            <a class="text-slate-500" href="${escapeHtml(download)}" target="_blank">⬇</a>
          </li>`;
        })
        .join("");
    }

    function handleAttachmentSubmit(event) {
      event.preventDefault();
      if (!attachmentInput) return;
      if (!ATTACHMENT_EDITABLE_STATUSES.has(currentStatusKey)) {
        showAttachmentMessage("Chỉ xử lý tệp khi văn bản đang chờ kiểm tra hoặc đã vào sổ.", true);
        return;
      }
      const file = attachmentInput.files?.[0];
      if (!file) {
        showAttachmentMessage("Chưa chọn tệp để tải lên.", true);
        return;
      }
      const formData = new FormData();
      formData.append("file", file);
      if (attachmentSubmit) {
        attachmentSubmit.disabled = true;
        attachmentSubmit.textContent = "Đang tải lên…";
      }
      docApi
        .uploadAttachment(docId, formData)
        .then(() => {
          showAttachmentMessage("Đã tải tệp đính kèm.", false);
          if (attachmentInput) {
            attachmentInput.value = "";
          }
          return fetchAttachments();
        })
        .catch((error) => {
          console.warn("[vanthu] Lỗi tải tệp đính kèm:", error);
          showAttachmentMessage(error?.message || "Không thể tải tệp lên.", true);
        })
        .finally(() => {
          if (attachmentSubmit) {
            attachmentSubmit.disabled = false;
            attachmentSubmit.textContent = "Tải lên";
          }
        });
    }

    function renderDispatches(list) {
      if (!dispatchList) return;
      const items = Array.isArray(list) ? list : [];
      if (!items.length) {
        dispatchList.innerHTML =
          '<li class="text-slate-500">Chưa có lịch gửi.</li>';
        if (dispatchNumberEl) dispatchNumberEl.textContent = "—";
        if (dispatchDateEl) dispatchDateEl.textContent = "—";
        if (dispatchMethodEl) dispatchMethodEl.textContent = "—";
        return;
      }
      dispatchList.innerHTML = items
        .map((item) => {
          const receiver = item.to_org_name || item.organization?.name || "Đơn vị nhận";
          const channel = item.channel || item.method || "—";
          const status = item.status || "—";
          const time = formatDateTime(item.sent_at || item.created_at);
          const tracking = item.tracking_no ? `Tracking: ${escapeHtml(item.tracking_no)}` : "";
          return `<li class="rounded-lg border border-slate-100 p-3 space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-800">${escapeHtml(receiver)}</span>
              <span class="text-[12px] text-slate-500">${escapeHtml(status)}</span>
            </div>
            <div class="text-[12px] text-slate-500">${escapeHtml(channel)} • ${escapeHtml(time)} ${
            tracking ? "• " + tracking : ""
          }</div>
          </li>`;
        })
        .join("");
      const latest = items[0];
      if (dispatchNumberEl) dispatchNumberEl.textContent = latest?.tracking_no || latest?.id || "—";
      if (dispatchDateEl) dispatchDateEl.textContent = formatDate(latest?.sent_at);
      if (dispatchMethodEl) dispatchMethodEl.textContent = latest?.channel || latest?.method || "—";
    }

    function renderVersions(list) {
      if (!versionsList) return;
      const items = Array.isArray(list) ? list : [];
      if (!items.length) {
        versionsList.innerHTML =
          '<li class="text-slate-500">Chưa có phiên bản.</li>';
        return;
      }
      versionsList.innerHTML = items
        .map((version) => {
          const label = version.label || `Phiên bản ${version.version || "?"}`;
          const edited = formatDateTime(version.decided_at || version.created_at || version.created_at);
          return `<li class="rounded-lg border border-slate-100 p-3">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-800">${escapeHtml(label)}</span>
              <span class="text-[12px] text-slate-500">${escapeHtml(edited)}</span>
            </div>
            <p class="text-[12px] text-slate-500">${escapeHtml(version.note || "")}</p>
          </li>`;
        })
        .join("");
    }

    function renderComments(list) {
      if (!commentList) return;
      const items = Array.isArray(list) ? list : [];
      if (!items.length) {
        commentList.innerHTML =
          '<li class="text-slate-500">Chưa có trao đổi.</li>';
        return;
      }
      commentList.innerHTML = items
        .map((entry) => {
          const actor = formatUser(entry.user);
          const at = formatDate(entry.created_at || entry.updated_at);
          const content = escapeHtml(entry.content || entry.comment || entry.note || "");
          return `<li class="rounded-lg border border-slate-100 p-3">
            <div class="flex items-center justify-between gap-3">
              <span class="font-medium text-slate-700">${escapeHtml(actor)}</span>
              <span class="text-[12px] text-slate-400">${escapeHtml(at)}</span>
            </div>
            <p class="mt-1 text-[13px] text-slate-600 leading-relaxed">${content}</p>
          </li>`;
        })
        .join("");
    }

    function showCommentMessage(text, isError) {
      if (!commentMessage) return;
      commentMessage.textContent = text || "";
      commentMessage.classList.toggle("text-rose-500", Boolean(isError));
      commentMessage.classList.toggle("text-emerald-600", Boolean(!isError && text));
    }

    function fetchComments() {
      if (!commentList || !api?.request || !api?.buildUrl) {
        return Promise.resolve();
      }
      if (Number.isNaN(commentEntityId)) {
        showCommentMessage("Thiếu mã văn bản hợp lệ để tải bình luận.", true);
        renderComments([]);
        return Promise.resolve();
      }
      const params = { entity_type: "document", entity_id: commentEntityId };
      const loader = commentApi?.list
        ? commentApi.list(params)
        : api.request(api.buildUrl("/api/v1/comments/", params));
      return loader
        .then((payload) =>
          renderComments(Array.isArray(payload) ? payload : toArray(payload))
        )
        .catch((error) => {
          console.warn("[vanthu] Lỗi tải bình luận:", error);
          showCommentMessage("Không tải được bình luận.", true);
          renderComments([]);
        });
    }

    function handleCommentSubmit(event) {
      event.preventDefault();
      if (!commentContent || !api?.request) return;
      if (Number.isNaN(commentEntityId)) {
        showCommentMessage("Không xác định được văn bản để gửi bình luận.", true);
        return;
      }
      const content = commentContent.value.trim();
      if (!content) {
        showCommentMessage("Nội dung bình luận không được để trống.", true);
        return;
      }
      showCommentMessage("", false);
      const payload = {
        entity_type: "document",
        entity_id: commentEntityId,
        content,
      };
      const submitter = commentApi?.create
        ? commentApi.create(payload)
        : api.request("/api/v1/comments/", { method: "POST", body: payload });
      submitter
        .then(() => {
          commentContent.value = "";
          showCommentMessage("Đã gửi bình luận.", false);
          return fetchComments();
        })
        .catch((error) => {
          console.warn("[vanthu] Lỗi gửi bình luận:", error);
          showCommentMessage(
            error?.message
              ? `Không gửi được bình luận: ${error.message}`
              : "Không gửi được bình luận.",
            true
          );
        });
    }

    function fetchAssignments() {
      if (!docApi.assignments) {
        renderAssignments([]);
        return Promise.resolve();
      }
      return docApi
        .assignments(docId)
        .then((payload) => renderAssignments(toArray(payload)))
        .catch((error) => {
          console.warn("[vanthu] Lỗi tải phân công:", error);
          renderAssignments([]);
        });
    }

    function fetchApprovals() {
      if (!document.getElementById("doc-approvals") || !docApi.approvals) {
        renderApprovals([]);
        return Promise.resolve();
      }
      return docApi
        .approvals(docId)
        .then((payload) => renderApprovals(toArray(payload)))
        .catch((error) => {
          console.warn("[vanthu] Lỗi tải trình ký:", error);
          renderApprovals([]);
        });
    }

    function fetchAttachments() {
      if (!docApi.attachments) {
        renderAttachments([]);
        return Promise.resolve();
      }
      return docApi
        .attachments(docId)
        .then((payload) => renderAttachments(toArray(payload)))
        .catch((error) => {
          console.warn("[vanthu] Lỗi tải đính kèm:", error);
          renderAttachments([]);
        });
    }

    function fetchLogs() {
      if (!docApi.workflowLogs) {
        renderLogs([]);
        return Promise.resolve();
      }
      return docApi
        .workflowLogs(docId)
        .then((payload) => renderLogs(toArray(payload)))
        .catch((error) => {
          console.warn("[vanthu] Lỗi tải nhật ký:", error);
          renderLogs([]);
        });
    }

    function fetchDispatches() {
      if (!docApi.dispatches) {
        renderDispatches([]);
        return Promise.resolve();
      }
      return docApi
        .dispatches(docId)
        .then((payload) => renderDispatches(toArray(payload)))
        .catch((error) => {
          console.warn("[vanthu] Lỗi tải dispatch:", error);
          renderDispatches([]);
        });
    }

    function fetchVersions() {
      if (!docApi.versions) {
        renderVersions([]);
        return Promise.resolve();
      }
      return docApi
        .versions(docId)
        .then((payload) => renderVersions(toArray(payload)))
        .catch((error) => {
          console.warn("[vanthu] Lỗi tải phiên bản:", error);
          renderVersions([]);
        });
    }

    function loadDocument() {
      clearError();
      docApi
        .retrieve(docId)
        .then((doc) => {
          renderDoc(doc);
          return Promise.all([
            fetchAssignments(),
            fetchApprovals(),
            fetchAttachments(),
            fetchLogs(),
            fetchDispatches(),
            fetchVersions(),
            fetchComments(),
          ]);
        })
        .catch((error) => {
          console.error("[vanthu] Lỗi tải chi tiết văn bản đi:", error);
          showError("Không thể tải chi tiết văn bản.");
        });
    }

    if (attachmentForm) {
      attachmentForm.addEventListener("submit", handleAttachmentSubmit);
    }

    if (commentForm) {
      commentForm.addEventListener("submit", handleCommentSubmit);
    }

    loadDocument();
  });
})();
