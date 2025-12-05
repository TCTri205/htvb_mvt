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
    const idParam = params.get("id");
    if (idParam) {
      return String(idParam).trim();
    }
    const segments = window.location.pathname.split("/").filter(Boolean);
    return segments.pop() || null;
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

  function escapeAttr(value) {
    return (value || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const LOG_ATTACHMENT_TYPE = "nhat_ky_xu_ly";

  function isLogAttachment(file) {
    if (!file) return false;
    const type = String(file.attachment_type || "").toLowerCase();
    return type === LOG_ATTACHMENT_TYPE;
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      const plain = String(value).split("T")[0];
      return plain || String(value);
    }
    return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}/${date.getFullYear()}`;
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(
      2,
      "0"
    )}`;
    return `${formatDate(date)} ${time}`;
  }

  function formatStatusLabel(status) {
    if (!status) return "";
    if (typeof status === "string") {
      return status;
    }
    if (typeof status === "object") {
      return status.name || status.code || status.status_name || "";
    }
    return String(status);
  }

  function formatUser(user) {
    if (!user) return "—";
    if (typeof user === "string") return user;
    return user.full_name || user.name || user.username || "—";
  }

  onReady(() => {
    const api = window.ApiClient;
    const docApi = api?.documents;
    if (!docApi) {
      console.warn("[chuyenvien] Document API chưa sẵn sàng cho chi tiết CV.");
      return;
    }

    // Nếu chưa đăng nhập hoặc token hết hạn, điều hướng về trang đăng nhập
    if (typeof api?.ensureAuthenticated === "function") {
      api.ensureAuthenticated().catch(() => {
        window.location.href = "/auth/login/?next=" + encodeURIComponent(window.location.pathname + window.location.search);
      });
    }

    const docId = getDocId();
    if (!docId) {
      console.warn("[chuyenvien] Không xác định được ID văn bản trong chi tiết.");
      return;
    }

    const summaryEl = document.getElementById("doc-summary");
    const titleEl = document.getElementById("doc-title");
    const directionBadge = document.getElementById("doc-badge-direction");
    const statusBadge = document.getElementById("doc-badge-status");
    const urgencyBadge = document.getElementById("doc-badge-urgency");
    const workflowStatusChip = document.getElementById("cv-workflow-status");
    const workflowDeadlineChip = document.getElementById("cv-workflow-deadline");
    const metaCode = document.getElementById("doc-meta-code");
    const metaNumber = document.getElementById("doc-meta-number");
    const metaIssued = document.getElementById("doc-meta-issued");
    const metaReceived = document.getElementById("doc-meta-received");
    const metaSender = document.getElementById("doc-meta-sender");
    const metaReceivedBy = document.getElementById("doc-meta-received-by");
    const metaField = document.getElementById("doc-meta-field");
    const metaDeadline = document.getElementById("doc-meta-deadline");
    const assignmentsBody = document.getElementById("doc-assignments-body");
    const attachmentsList = document.getElementById("doc-attachment-list");
    const logsList = document.getElementById("doc-log-list");
    const logToggle = document.getElementById("cv-log-toggle");
    const logForm = document.getElementById("cv-log-form");
    const logFile = document.getElementById("cv-log-file");
    const logMessage = document.getElementById("cv-log-message");
    const workflowPanel = document.getElementById("doc-workflow-panel");
    const workflowTool = window.DocumentUIWorkflow;
    const commentList = document.getElementById("doc-comment-list");
    const commentForm = document.getElementById("cv-comment-form");
    const commentContent = document.getElementById("cv-comment-content");
    const commentMessage = document.getElementById("cv-comment-message");
    const commentToggle = document.getElementById("cv-comment-toggle");
    const commentApi = api?.comments;
    const commentEntityId = Number.parseInt(docId, 10);
    let workflowInstance = null;
    let logsCache = [];

    function renderDoc(doc) {
      if (!doc) return;
      const status = (doc.status?.code || doc.status_name || doc.state || doc.status || "RECEIVED")
        .toString()
        .toUpperCase()
        .replace(/\s+/g, "_");
      if (directionBadge) {
        directionBadge.textContent = doc.direction || "Văn bản đến";
      }
      if (statusBadge) {
        statusBadge.textContent = escapeHtml(status.replace(/_/g, " "));
      }
      if (urgencyBadge) {
        const level = (doc.important_level || doc.urgency?.name || doc.urgency?.code || "Thường")
          .toString()
          .replace(/_/g, " ");
        urgencyBadge.textContent = level;
      }
      if (titleEl) {
        titleEl.textContent = doc.title || doc.subject || "Văn bản đến";
      }
      if (summaryEl) {
        summaryEl.textContent =
          doc.summary || doc.note || "Đang tải nội dung xử lý.";
      }
      if (metaCode) {
        metaCode.textContent = doc.document_code || "—";
      }
      if (metaNumber) {
        metaNumber.textContent = doc.received_number || doc.number || "—";
      }
      if (metaIssued) {
        metaIssued.textContent = formatDate(doc.issued_date || doc.created_at);
      }
      if (metaReceived) {
        metaReceived.textContent = formatDate(doc.received_date);
      }
      if (metaSender) {
        metaSender.textContent = doc.from_org_name || doc.sender || "—";
      }
      if (metaReceivedBy) {
        metaReceivedBy.textContent = formatUser(doc.received_by || doc.receiver);
      }
      if (metaField) {
        metaField.textContent = doc.field?.name || doc.department?.name || "—";
      }
      if (metaDeadline) {
        metaDeadline.textContent = formatDate(doc.deadline || doc.due_date || doc.expected_finish);
      }
      if (workflowDeadlineChip) {
        workflowDeadlineChip.textContent = formatDate(doc.deadline || doc.due_date || doc.expected_finish);
      }
      if (workflowStatusChip) {
        workflowStatusChip.textContent = status.replace(/_/g, " ");
      }
      mountWorkflow(status);
    }

    function mountWorkflow(status) {
      if (!workflowTool || !workflowPanel) return;
      const payload = {
        container: workflowPanel,
        docId,
        role: "CV",
        status,
        direction: "INBOUND",
        route: "vanbanden",
        allowWithdraw: false,
      };
      if (!workflowInstance) {
        workflowInstance = workflowTool.mount(payload);
      } else if (typeof workflowInstance.update === "function") {
        workflowInstance.update(status);
      }
    }

    function renderAssignments(items) {
      if (!assignmentsBody) return;
      assignmentsBody.innerHTML = "";
      const list = Array.isArray(items) ? items : [];
      if (!list.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="5" class="px-5 py-4 text-center text-sm text-slate-500">Chưa có phân công.</td>`;
        assignmentsBody.appendChild(tr);
        return;
      }
      list.forEach((item) => {
        assignmentsBody.appendChild(buildAssignmentRow(item));
      });
    }

    function buildAssignmentRow(item) {
      const tr = document.createElement("tr");
      const assignee = formatUser(item.user || item.assignee);
      const assignor = formatUser(item.assigned_by);
      const due = formatDate(item.due_at || item.due_date);
      const roleLabel = assignmentRoleLabel(item.role_on_doc || item.role);
      const stateLabel = item.active ? "Đang xử lý" : "Hoàn tất";
      tr.innerHTML = `
        <td class="px-5 py-3"><div class="font-semibold text-slate-800">${escapeHtml(
          assignee
        )}</div><div class="text-[12px] text-slate-500">${escapeHtml(roleLabel)}</div></td>
        <td class="px-5 py-3"><span class="chip chip--blue">${escapeHtml(roleLabel)}</span></td>
        <td class="px-5 py-3">${escapeHtml(assignor)}</td>
        <td class="px-5 py-3">${escapeHtml(due)}</td>
        <td class="px-5 py-3"><span class="chip chip--amber">${escapeHtml(stateLabel)}</span></td>
      `;
      return tr;
    }

    function assignmentRoleLabel(role) {
      if (!role) return "Đã giao";
      const cleaned = role.toString().toLowerCase();
      if (cleaned.includes("chu_tri")) return "Chủ trì";
      if (cleaned.includes("phoi")) return "Phối hợp";
      if (cleaned.includes("watch")) return "Theo dõi";
      return role;
    }

    function renderLogs(items) {
      if (!logsList) return;
      const list = Array.isArray(items) ? items : [];
      if (!list.length) {
        logsList.innerHTML = '<li class="text-slate-500">Chưa có nhật ký xử lý.</li>';
        logsCache = [];
        return;
      }
      logsList.innerHTML = list
        .map((entry) => {
          const actor = formatUser(entry.actor || entry.actor_id);
          const action = entry.action || entry.note || entry.content || "Upload";
          const time = formatDateTime(entry.acted_at || entry.created_at);
          const from = formatStatusLabel(entry.from_status || entry.from_status_name);
          const to = formatStatusLabel(entry.to_status || entry.to_status_name);
          const attachment =
            entry.attachment ||
            (entry.attachment_id
              ? {
                  id: entry.attachment_id,
                  name: entry.attachment_name || entry.file_name,
                  url:
                    (docApi &&
                      typeof docApi.attachmentDownloadUrl === "function" &&
                      docApi.attachmentDownloadUrl(docId, entry.attachment_id)) ||
                    entry.attachment_url,
                }
              : null);
          const attachmentHtml = attachment
            ? `<a class="js-log-download text-blue-600 hover:underline" href="#" data-attachment-id="${escapeHtml(
                attachment.id || ""
              )}" data-attachment-name="${escapeHtml(attachment.name || "Tệp xử lý")}">Tải file: ${escapeHtml(
                attachment.name || "Xem tệp"
              )}</a>`
            : "";
          return `<li class="rounded-lg border border-slate-100 p-3 space-y-1 text-[13px]">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-800">${escapeHtml(action)}</span>
              <span class="text-[12px] text-slate-500">${escapeHtml(time)}</span>
            </div>
            ${
              attachmentHtml
                ? /* keep download link data */ `<div class="text-[13px] text-blue-700">${attachmentHtml}</div>`
                : `<p class="text-[13px] text-slate-500 mb-1">${escapeHtml(
                    entry.note || entry.detail || entry.content || ""
                  )}</p>`
            }
            <div class="text-[12px] text-slate-400">
              ${escapeHtml(actor)} ${from && to ? `• ${escapeHtml(from)} → ${escapeHtml(to)}` : ""}
            </div>
          </li>`;
        })
        .join("");
      logsCache = list.slice();
    }

    function renderAttachments(items) {
      if (!attachmentsList) return;
      const list = Array.isArray(items) ? items : [];
      const visible = list.filter((file) => !isLogAttachment(file));
      if (!visible.length) {
        attachmentsList.innerHTML = '<li class="text-slate-500">Chưa có tệp đính kèm.</li>';
        return;
      }
      attachmentsList.innerHTML = visible
        .map((file) => {
          const name = file.name || file.filename || file.file_name || "Tệp đính kèm";
          const uploadedAt = formatDateTime(file.created_at || file.uploaded_at);
          const attachmentId = file.id || file.attachment_id;
          let downloadUrl = "#";
          if (attachmentId && docApi && typeof docApi.attachmentDownloadUrl === "function") {
            try {
              const candidateUrl = docApi.attachmentDownloadUrl(docId, attachmentId);
              downloadUrl = candidateUrl || "#";
            } catch (_error) {
              downloadUrl = "#";
            }
          }
          return `<li class="rounded-lg border border-slate-100 p-3 text-[13px]">
            <a href="${escapeAttr(downloadUrl)}" target="_blank" class="font-semibold text-slate-800">${escapeHtml(
              name
            )}</a>
            <div class="text-[12px] text-slate-500">Ngày tải lên: ${escapeHtml(uploadedAt)}</div>
          </li>`;
        })
        .join("");
    }

    function renderComments(items) {
      if (!commentList) return;
      const list = Array.isArray(items) ? items : [];
      if (!list.length) {
        commentList.innerHTML = '<li class="text-slate-500">Chưa có trao đổi.</li>';
        return;
      }
      commentList.innerHTML = list
        .map((entry) => {
          const actor = formatUser(entry.user || entry.created_by);
          const at = formatDateTime(entry.created_at || entry.updated_at);
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
      commentMessage.classList.toggle("text-emerald-600", !isError);
    }

    function toArray(payload) {
      if (!payload) return [];
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(payload.items)) return payload.items;
      if (Array.isArray(payload.results)) return payload.results;
      return [];
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
          console.warn("[chuyenvien] Lỗi tải phân công:", error);
          renderAssignments([]);
        });
    }

    function fetchLogs() {
      const tasks = [];
      if (docApi.workflowLogs) {
        tasks.push(
          docApi
            .workflowLogs(docId)
            .then((payload) => toArray(payload))
            .catch((error) => {
              console.warn("[chuyenvien] Lỗi tải nhật ký:", error);
              return [];
            })
        );
      }
      if (docApi.attachments) {
        tasks.push(
          docApi
            .attachments(docId)
            .then((payload) =>
              toArray(payload).map((file) => ({
                actor: file.uploader,
                note: file.description || "Đã tải lên tệp xử lý",
                attachment_id: file.id || file.attachment_id,
                attachment_name: file.name || file.file_name || file.filename,
                attachment_url:
                  (docApi &&
                    typeof docApi.attachmentDownloadUrl === "function" &&
                    file.id &&
                    docApi.attachmentDownloadUrl(docId, file.id)) ||
                  null,
                acted_at: file.created_at || file.uploaded_at,
              }))
            )
            .catch((error) => {
              console.warn("[chuyenvien] Lỗi tải tệp đính kèm:", error);
              return [];
            })
        );
      }
      return Promise.all(tasks).then((chunks) => {
        const merged = [];
        chunks.forEach((chunk) => merged.push(...(chunk || [])));
        merged.sort((a, b) => {
          const ta = new Date(a.acted_at || a.created_at || 0).getTime();
          const tb = new Date(b.acted_at || b.created_at || 0).getTime();
          return tb - ta;
        });
        renderLogs(merged);
      });
    }

    function fetchAttachments() {
      if (!docApi.attachments) {
        renderAttachments([]);
        return Promise.resolve();
      }
      return docApi
        .attachments(docId, { params: { exclude_log: 1 } })
        .then((payload) => renderAttachments(toArray(payload)))
        .catch((error) => {
          console.warn("[chuyenvien] Lỗi tải tệp đính kèm:", error);
          renderAttachments([]);
        });
    }

    function fetchComments() {
      if (!commentList || !api?.request || !api?.buildUrl) {
        return Promise.resolve();
      }
      if (Number.isNaN(commentEntityId)) {
        showCommentMessage("Thiếu mã văn bản hợp lệ để tải trao đổi.", true);
        renderComments([]);
        return Promise.resolve();
      }
      const params = { entity_type: "document", entity_id: commentEntityId };
      const loader = commentApi?.list
        ? commentApi.list(params)
        : api.request(api.buildUrl("/api/v1/comments/", params));
      return loader
        .then((payload) => renderComments(Array.isArray(payload) ? payload : toArray(payload)))
        .catch((error) => {
          console.warn("[chuyenvien] Lỗi tải bình luận:", error);
          showCommentMessage("Không tải được trao đổi.", true);
          renderComments([]);
        });
    }

    function handleCommentSubmit(event) {
      event.preventDefault();
      if (!commentContent || !api?.request) return;
      if (Number.isNaN(commentEntityId)) {
        showCommentMessage("Không xác định được văn bản để gửi trao đổi.", true);
        return;
      }
      const content = commentContent.value.trim();
      if (!content) {
        showCommentMessage("Nội dung trao đổi không được để trống.", true);
        return;
      }
      showCommentMessage("", false);
      const payload = { entity_type: "document", entity_id: commentEntityId, content };
      const submitter = commentApi?.create
        ? commentApi.create(payload)
        : api.request("/api/v1/comments/", { method: "POST", body: payload });
      submitter
        .then(() => {
          commentContent.value = "";
          showCommentMessage("Đã gửi trao đổi.", false);
          return fetchComments();
        })
        .catch((error) => {
          console.warn("[chuyenvien] Lỗi gửi trao đổi:", error);
          showCommentMessage(
            error?.message ? `Không gửi được trao đổi: ${error.message}` : "Không gửi được trao đổi.",
            true
          );
        });
    }

    function loadDocument() {
      return docApi
        .retrieve(docId)
        .then((doc) => {
          renderDoc(doc);
          return Promise.all([
            fetchAssignments(),
            fetchLogs(),
            fetchAttachments(),
            fetchComments(),
          ]);
        })
        .catch((error) => {
          console.error("[chuyenvien] Lỗi tải chi tiết văn bản đến:", error);
          if (error?.status === 401) {
            window.location.href = "/auth/login/?next=" + encodeURIComponent(window.location.pathname + window.location.search);
          }
        });
    }

    if (commentForm) {
      commentForm.addEventListener("submit", handleCommentSubmit);
    }

    if (commentToggle && commentContent) {
      commentToggle.addEventListener("click", () => {
        commentContent.focus();
        if (typeof commentContent.scrollIntoView === "function") {
          commentContent.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    }

    if (logToggle && logForm) {
      logToggle.addEventListener("click", () => {
        const isHidden = logForm.classList.contains("hidden");
        logForm.classList.toggle("hidden", !isHidden);
      });
    }

    if (logForm) {
      logForm.addEventListener("submit", handleLogSubmit);
    }

    function showLogMessage(text, isError) {
      if (!logMessage) return;
      logMessage.textContent = text || "";
      logMessage.classList.toggle("text-rose-500", Boolean(isError));
      logMessage.classList.toggle("text-emerald-600", !isError);
    }

    function handleLogSubmit(event) {
      event.preventDefault();
      if (!api?.request) return;
      const fileObj = logFile?.files?.[0];
      if (!fileObj) {
        showLogMessage("Vui lòng chọn tệp để lưu nhật ký.", true);
        return;
      }
      showLogMessage("", false);

      const formData = new FormData();
      formData.append("file", fileObj);
      formData.append("attachment_type", LOG_ATTACHMENT_TYPE);
      const url = `/api/v1/documents/${encodeURIComponent(docId)}/attachments/`;

      api
        .request(url, { method: "POST", body: formData })
        .then((resp) => {
          if (logFile) logFile.value = "";
          showLogMessage("Đã lưu nhật ký xử lý.", false);
          try {
            const attachmentId = resp?.id || resp?.attachment_id;
            const downloadUrl =
              (docApi &&
                typeof docApi.attachmentDownloadUrl === "function" &&
                attachmentId &&
                docApi.attachmentDownloadUrl(docId, attachmentId)) ||
              null;
            prependLogEntry("Đã tải lên tệp xử lý", {
              id: attachmentId,
              name: resp?.name || resp?.file_name || resp?.filename,
              url: downloadUrl,
            });
          } catch (_e) {
            /* no-op */
          }
          return fetchLogs().then(() => fetchAttachments());
        })
        .catch((error) => {
          console.warn("[chuyenvien] Lỗi lưu nhật ký:", error);
          showLogMessage(error?.message || "Không thể lưu nhật ký.", true);
        });
    }

    function prependLogEntry(note, attachment) {
      const entry = {
        actor: "Bạn",
        note,
        attachment,
        acted_at: new Date().toISOString(),
      };
      logsCache = [entry, ...(logsCache || [])];
      renderLogs(logsCache);
    }

    document.addEventListener("click", handleLogDownloadClick);
    loadDocument();

    function handleLogDownloadClick(event) {
      const target = event.target.closest(".js-log-download");
      if (!target) return;
      event.preventDefault();
      const attachmentId = target.dataset.attachmentId;
      if (!attachmentId) return;
      const filename = target.dataset.attachmentName || "attachment";
      downloadAttachment(attachmentId, filename).catch((error) => {
        console.warn("[chuyenvien] Lỗi tải file:", error);
        showLogMessage(error?.message || "Không thể tải file.", true);
      });
    }

    async function downloadAttachment(attachmentId, filename) {
      if (!api?.buildUrl) {
        throw new Error("API client chưa sẵn sàng.");
      }
      const path = `/api/v1/documents/${encodeURIComponent(docId)}/attachments/${encodeURIComponent(
        attachmentId
      )}/download/`;
      const url = api.buildUrl(path);
      const token = api.getAccessToken ? api.getAccessToken() : null;
      const headers = new Headers();
      headers.set("Accept", "*/*");
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      const response = await fetch(url, {
        method: "GET",
        headers,
        credentials: "omit",
      });
      if (!response.ok) {
        let detail = "Không thể tải file.";
        try {
          const payload = await response.json();
          if (payload && payload.detail) detail = payload.detail;
        } catch (_) {
          /* ignore */
        }
        throw new Error(detail);
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = filename || "download";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    }
  });
})();
