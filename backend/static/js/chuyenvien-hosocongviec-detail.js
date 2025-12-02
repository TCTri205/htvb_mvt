let currentCaseId = null;
let preloadedCase = null;

document.addEventListener("DOMContentLoaded", () => {
  const caseId = getCaseId();
  if (!caseId) {
    console.error("Cannot determine Case ID from URL");
    const errEl = $("[data-case-error]");
    if (errEl) {
      errEl.textContent = "Không tìm thấy ID hồ sơ.";
      errEl.classList.remove("hidden");
    }
    return;
  }
  currentCaseId = caseId;
  preloadedCase = readCaseData();
  if (preloadedCase) {
    renderCaseInfo(preloadedCase);
  }
  loadCaseDetail(caseId);
});

function getCaseId() {
  const root = document.querySelector("#case-detail-root");
  if (root?.dataset?.caseId) return root.dataset.caseId;
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const lastPart = pathParts[pathParts.length - 1];
  if (/^\d+$/.test(lastPart)) return lastPart;
  const matches = window.location.pathname.match(/\/([a-f0-9-]{36})\/?$/);
  if (matches) return matches[1];
  const params = new URLSearchParams(window.location.search);
  if (params.has("id")) return params.get("id");
  return null;
}

function readCaseData() {
  const script = document.getElementById("case-data");
  if (!script) return null;
  try {
    return JSON.parse(script.textContent || "{}");
  } catch (e) {
    console.error("Cannot parse case-data JSON", e);
    return null;
  }
}
const api = window.ApiClient;
const helpers = window.DocHelpers;

// Helper to safely set text content
function setText(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.textContent = value || "—";
}

// Helper to get element
function $(selector) {
  return document.querySelector(selector);
}

async function loadCaseDetail(caseId) {
  try {
    if (!preloadedCase) {
      throw new Error("Thiếu dữ liệu hồ sơ (case-data).");
    }
    renderCaseInfo(preloadedCase);

    // Load related data in parallel
    await Promise.allSettled([
      loadParticipants(caseId),
      loadTasks(caseId),
      loadActivityLogsAndComments(caseId),
      loadRelatedDocs(caseId)
    ]);

    setupInteractions(caseId);

  } catch (err) {
    console.error("Error loading case detail:", err);
    const errEl = $("[data-case-error]");
    if (errEl) {
      errEl.textContent = "Không thể tải thông tin hồ sơ. Vui lòng thử lại.";
      errEl.classList.remove("hidden");
    }
  }
}

async function loadParticipants(caseId) {
  try {
    const res = await api.request(`/api/v1/cases/${caseId}/participants/`);
    renderParticipants(res.results || res);
  } catch (e) {
    console.error("Error loading participants:", e);
  }
}

async function loadTasks(caseId) {
  try {
    const res = await api.request(`/api/v1/cases/${caseId}/tasks/`);
    const tasks = res.results || res;
    renderTasks(tasks);
    updateTaskMetrics(tasks);
  } catch (e) {
    console.error("Error loading tasks:", e);
  }
}

async function loadActivityLogsAndComments(caseId) {
  try {
    const [logs, comments] = await Promise.all([
      api.request(`/api/v1/cases/${caseId}/activity-logs/`),
      api.request(`/api/v1/comments/?entity_type=case&entity_id=${caseId}`)
    ]);
    
    // Normalize and merge
    // Logs: { action, note, at, actor }
    // Comments: { content, created_at, user }
    
    const combined = [
      ...(Array.isArray(logs) ? logs : []).map(l => ({ 
        ...l, 
        type: 'log', 
        at: l.at 
      })),
      ...(Array.isArray(comments) ? comments : []).map(c => ({ 
         action: "Bình luận", 
         note: c.content, 
         actor: c.user, 
         at: c.created_at,
         type: 'comment'
      }))
    ];
    
    // Sort by date desc
    combined.sort((a, b) => new Date(b.at) - new Date(a.at));
    
    renderActivityLogs(combined);
  } catch (e) {
    console.error("Error loading merged logs:", e);
  }
}

async function loadRelatedDocs(caseId) {
  try {
    const res = await api.request(`/api/v1/cases/${caseId}/documents/`);
    const docs = res.results || res;
    renderRelatedDocs(docs);
    updateDocMetrics(docs);
  } catch (e) {
    console.error("Error loading docs:", e);
  }
}

// --- Render Functions ---

function renderCaseInfo(data) {
  setText("[data-case-title]", data.title);
  setText("[data-case-code]", data.case_code);
  setText("[data-case-description]", data.description);
  setText("[data-case-department]", data.department?.name);
  setText("[data-case-leader]", data.leader?.full_name || data.leader?.username);
  if (Array.isArray(data.assignees) && data.assignees.length > 0) {
    setText(
      "[data-case-assignee]",
      data.assignees.map((u) => u.full_name || u.username || u.id).join(", ")
    );
  } else {
    setText("[data-case-assignee]", "—");
  }

  setText("[data-case-deadline]", helpers.formatDate(data.due_date));
  setText("[data-case-created]", helpers.formatDate(data.created_at));

  // Status Chip
  const statusEl = $("[data-case-status-chip]");
  // Normalize status code
  const rawCode = data.status?.code || data.status?.name || data.status || "";
  const statusCode = rawCode ? String(rawCode).toUpperCase().trim().replace(/\s+/g, '_') : "";

  if (statusEl) {
    statusEl.textContent = data.status?.name || data.status || "—";
    statusEl.className = "px-2.5 py-1 rounded-full text-xs font-semibold " + getStatusColor(statusCode);
  }

  // Priority Chip
  const priorityEl = $("[data-case-priority-chip]");
  if (priorityEl) {
    priorityEl.textContent = getPriorityLabel(data.priority);
    priorityEl.className = "px-2.5 py-1 rounded-full text-xs font-semibold " + getPriorityColor(data.priority);
  }

  // Show/Hide Submit button (MOI_TAO -> CHO_PHAN_CONG)
  const btnSubmit = $("[data-action='submit']");
  if (btnSubmit) {
    if (statusCode === 'MOI_TAO') {
      btnSubmit.classList.remove("hidden");
    } else {
      btnSubmit.classList.add("hidden");
    }
  }

  // Show/Hide Request Close button (DANG_THUC_HIEN -> CHO_DUYET_DONG)
  // Once submitted, specialist cannot cancel - only Leader can approve/reject
  const btnRequestClose = $("[data-action='request-close']");
  if (btnRequestClose) {
    // Show ONLY in DANG_THUC_HIEN status
    if (statusCode === 'DANG_THUC_HIEN') {
      btnRequestClose.classList.remove("hidden");
      btnRequestClose.disabled = false;
    } else {
      // Hide in all other statuses (including CHO_DUYET_DONG)
      btnRequestClose.classList.add("hidden");
      btnRequestClose.disabled = true;
    }
  }
}

function renderParticipants(list) {
  const tbody = $("[data-case-members]");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="px-5 py-4 text-center text-sm text-slate-500">Chưa có thành viên.</td></tr>`;
    return;
  }

  list.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="px-5 py-3">
        <div class="font-medium text-slate-700">${helpers.escapeHtml(p.user?.full_name || p.user?.username)}</div>
      </td>
      <td class="px-5 py-3">
        <span class="px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-600">
          ${getRoleLabel(p.role_on_case)}
        </span>
      </td>
      <td class="px-5 py-3 text-slate-600">${helpers.escapeHtml(p.user?.department?.name || "—")}</td>
      <td class="px-5 py-3 text-slate-500 text-xs">
         —
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderTasks(list) {
  const container = $("[data-case-tasks]");
  if (!container) return;
  container.innerHTML = "";

  if (!list || list.length === 0) {
    container.innerHTML = `<li class="text-center text-sm text-slate-500 py-2">Chưa có nhiệm vụ.</li>`;
    return;
  }

  list.forEach(task => {
    const li = document.createElement("li");
    li.className = "rounded-lg border border-slate-100 p-3";
    li.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <div>
          <div class="font-medium text-slate-700">${helpers.escapeHtml(task.title)}</div>
          <div class="text-[12px] text-slate-500">
            Phụ trách: ${helpers.escapeHtml(task.assignee?.full_name || "—")} • 
            Hạn: ${helpers.formatDate(task.due_at)}
          </div>
        </div>
        <span class="px-2 py-0.5 rounded text-xs font-medium ${getTaskStatusColor(task.status)}">
          ${task.status}
        </span>
      </div>
    `;
    
    // Add "Chi tiết" button
    const btnDetail = document.createElement("button");
    btnDetail.className = "text-xs text-blue-600 hover:underline ml-2 font-medium";
    btnDetail.textContent = "Chi tiết";
    btnDetail.onclick = () => openTaskDetail(task);

    // Find the status span and insert before or append to container
    const statusDiv = li.querySelector(".flex.items-center.gap-2 > div:last-child") || li.querySelector(".flex.items-center.justify-between > span").parentNode;
    
    const rightDiv = document.createElement("div");
    rightDiv.className = "flex items-center gap-2";
    rightDiv.appendChild(btnDetail);
    
    // Get the status span
    const statusSpan = li.querySelector("span.rounded");
    if (statusSpan) {
        statusSpan.parentNode.insertBefore(rightDiv, statusSpan);
        rightDiv.appendChild(statusSpan);
    }

    container.appendChild(li);
  });
  
  setText("[data-case-task-count]", `${list.length} nhiệm vụ`);
}

// --- Task Detail Logic ---
let currentTaskDetailId = null;

async function openTaskDetail(task) {
  currentTaskDetailId = task.task_id;
  const modal = document.getElementById("modalTaskDetail");
  if (!modal) return;

  // 1. Fill Info
  setText("[data-task-detail-title]", task.title);
  setText("[data-task-detail-status]", task.status);
  setText("[data-task-detail-creator]", task.created_by?.full_name || task.created_by?.username || "—");
  setText("[data-task-detail-due]", helpers.formatDate(task.due_at));
  setText("[data-task-detail-note]", task.note || "Không có ghi chú");

  // 2. Setup Actions
  const btnComplete = modal.querySelector("[data-task-action='complete']");
  const btnUndo = modal.querySelector("[data-task-action='undo']");
  const isDone = task.status === 'DONE' || task.status === 'Hoàn thành';

  if (btnComplete) {
    btnComplete.classList.toggle("hidden", isDone);
    btnComplete.onclick = () => toggleTaskStatus(task.task_id, "DONE");
  }
  if (btnUndo) {
    btnUndo.classList.toggle("hidden", !isDone);
    btnUndo.onclick = () => toggleTaskStatus(task.task_id, "IN_PROGRESS");
  }

  // 3. Setup Upload
  const fileInput = modal.querySelector("[data-task-upload-input]");
  if (fileInput) {
    fileInput.value = ""; // Reset
    fileInput.onchange = (e) => {
      if (e.target.files.length > 0) {
        handleTaskAttachmentUpload(task.task_id, e.target.files[0]);
      }
    };
  }

  // 4. Load Attachments
  loadTaskAttachments(task.task_id);

  // 5. Show Modal
  modal.showModal();
}

async function loadTaskAttachments(taskId) {
  const listEl = document.querySelector("[data-task-attachments-list]");
  if (!listEl) return;
  
  listEl.innerHTML = `<li class="text-center text-sm text-slate-500 py-4 italic">Đang tải tài liệu...</li>`;

  try {
    // Fetch all case attachments
    const res = await api.request(`/api/v1/cases/${currentCaseId}/attachments/`);
    const allAttachments = res.results || res || [];

    // Filter by prefix "TASK:{taskId}"
    const taskAttachments = allAttachments.filter(att => 
      att.attachment_type === `TASK:${taskId}`
    );

    renderTaskAttachments(taskAttachments);
  } catch (error) {
    console.error("Error loading task attachments:", error);
    listEl.innerHTML = `<li class="text-center text-sm text-rose-500 py-2">Lỗi tải tài liệu.</li>`;
  }
}

function renderTaskAttachments(list) {
  const listEl = document.querySelector("[data-task-attachments-list]");
  if (!listEl) return;
  listEl.innerHTML = "";

  if (!list || list.length === 0) {
    listEl.innerHTML = `<li class="text-center text-sm text-slate-500 py-2">Chưa có tài liệu đính kèm.</li>`;
    return;
  }

  list.forEach(att => {
    const li = document.createElement("li");
    li.className = "flex items-center justify-between p-2 rounded hover:bg-slate-50 border border-transparent hover:border-slate-100 group";
    
    // File info
    const leftDiv = document.createElement("div");
    leftDiv.className = "flex items-center gap-2 overflow-hidden flex-1 mr-2";
    leftDiv.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400 flex-shrink-0"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        <a href="${att.file_url || att.file}" target="_blank" class="text-sm text-slate-700 hover:text-blue-600 truncate" title="${helpers.escapeHtml(att.file_name)}">
          ${helpers.escapeHtml(att.file_name)}
        </a>
    `;

    // Actions
    const rightDiv = document.createElement("div");
    rightDiv.className = "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity";
    
    // Download Button
    const btnDownload = document.createElement("a");
    btnDownload.href = att.file_url || att.file;
    btnDownload.download = att.file_name; // Hint to browser
    btnDownload.target = "_blank";
    btnDownload.className = "p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50 transition";
    btnDownload.title = "Tải xuống";
    btnDownload.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
    
    // Delete Button
    const btnDelete = document.createElement("button");
    btnDelete.className = "p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition";
    btnDelete.title = "Xóa tài liệu";
    btnDelete.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    btnDelete.onclick = () => deleteTaskAttachment(att.attachment_id, currentTaskDetailId);

    rightDiv.appendChild(btnDownload);
    rightDiv.appendChild(btnDelete);

    li.appendChild(leftDiv);
    li.appendChild(rightDiv);
    listEl.appendChild(li);
  });
}

async function deleteTaskAttachment(attachmentId, taskId) {
  if (!confirm("Bạn có chắc chắn muốn xóa tài liệu này?")) return;

  try {
    await api.request(`/api/v1/cases/${currentCaseId}/attachments/${attachmentId}/`, {
      method: "DELETE"
    });
    
    showToast("Đã xóa tài liệu", "success");
    await loadTaskAttachments(taskId);
  } catch (error) {
    console.error("Error deleting attachment:", error);
    showToast("Không thể xóa tài liệu: " + (error.message || "Lỗi không xác định"), "error");
  }
}

async function handleTaskAttachmentUpload(taskId, file) {
  if (!file) return;

  // Optimistic UI update (optional, but good for UX)
  const listEl = document.querySelector("[data-task-attachments-list]");
  const loadingLi = document.createElement("li");
  loadingLi.className = "text-center text-sm text-blue-600 py-2 animate-pulse";
  loadingLi.textContent = `Đang tải lên ${file.name}...`;
  if (listEl.querySelector("li.text-center")) listEl.innerHTML = ""; // Clear "empty" message
  listEl.prepend(loadingLi);

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("attachment_type", `TASK:${taskId}`); // Prefix convention

    await api.request(`/api/v1/cases/${currentCaseId}/attachments/`, {
      method: "POST",
      body: formData,
    });

    // Reload attachments
    await loadTaskAttachments(taskId);
    showToast("Đã tải lên tài liệu thành công", "success");
  } catch (error) {
    console.error("Error uploading attachment:", error);
    loadingLi.remove();
    alert("Lỗi tải lên: " + (error.message || "Không xác định"));
  }
}

async function toggleTaskStatus(taskId, newStatus) {
  const actionName = newStatus === "DONE" ? "hoàn thành" : "huỷ hoàn thành";
  if (!confirm(`Bạn có chắc chắn muốn ${actionName} nhiệm vụ này?`)) return;

  try {
    // ✅ Correct endpoint: /api/v1/case-tasks/{id}/
    await api.request(`/api/v1/case-tasks/${taskId}/`, {
      method: "PATCH",
      body: { status: newStatus }
    });

    // Refresh data
    await loadTasks(currentCaseId);
    
    // Update modal if open
    const modal = document.getElementById("modalTaskDetail");
    if (modal && modal.open && currentTaskDetailId === taskId) {
      // Re-fetch task to update modal UI
      const res = await api.request(`/api/v1/cases/${currentCaseId}/tasks/`);
      const tasks = res.results || res;
      const updatedTask = tasks.find(t => t.task_id === taskId);
      if (updatedTask) openTaskDetail(updatedTask);
    }

    showToast(`Đã ${actionName} nhiệm vụ`, "success");
  } catch (error) {
    console.error("Error updating task status:", error);
    alert(`Lỗi ${actionName}: ` + (error.message || "Không xác định"));
  }
}

function showToast(message, type = "info") {
    // Simple alert fallback if toast not available, or implement custom toast
    // For now, let's assume there might be a toast element or just use alert for critical errors
    // But since we want "premium", let's try to find a toast container
    // If not found, create one
    let toastContainer = document.getElementById("toast-container");
    if (!toastContainer) {
        toastContainer = document.createElement("div");
        toastContainer.id = "toast-container";
        toastContainer.className = "fixed bottom-4 right-4 z-50 flex flex-col gap-2";
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement("div");
    const bgClass = type === "success" ? "bg-emerald-600" : type === "error" ? "bg-rose-600" : "bg-slate-800";
    toast.className = `${bgClass} text-white px-4 py-3 rounded shadow-lg text-sm font-medium transform transition-all duration-300 translate-y-10 opacity-0`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.classList.remove("translate-y-10", "opacity-0");
    });

    // Remove after 3s
    setTimeout(() => {
        toast.classList.add("opacity-0", "translate-y-2");
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function renderActivityLogs(list) {
  const container = $("[data-case-activity]");
  if (!container) return;
  container.innerHTML = "";

  if (!list || list.length === 0) {
    container.innerHTML = `<li class="text-center text-sm text-slate-500 py-2">Chưa có nhật ký.</li>`;
    return;
  }

  list.forEach(log => {
    const li = document.createElement("li");
    li.className = "rounded-lg border border-slate-100 p-3 space-y-1";
    li.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="font-semibold text-slate-700 text-sm">${helpers.escapeHtml(log.action)}</span>
        <span class="text-[11px] text-slate-400">${helpers.formatDate(log.at, true)}</span>
      </div>
      <p class="text-[13px] text-slate-600">${helpers.escapeHtml(log.note || "")}</p>
      <div class="text-[11px] text-slate-400">Bởi: ${helpers.escapeHtml(log.actor?.full_name || "Hệ thống")}</div>
    `;
    container.appendChild(li);
  });
}

function renderRelatedDocs(list) {
  const container = $("[data-case-docs]");
  if (!container) return;
  container.innerHTML = "";

  if (!list || list.length === 0) {
    container.innerHTML = `<li class="text-center text-sm text-slate-500 py-2">Chưa có văn bản liên quan.</li>`;
    return;
  }

  list.forEach(item => {
    // item is CaseDocument, containing 'document' object
    const doc = item.document;
    const li = document.createElement("li");
    li.className = "rounded-lg border border-slate-100 p-3 flex items-center justify-between gap-3";
    
    // LINK ADJUSTED FOR CHUYENVIEN
    const docUrl = doc.direction === 'di' 
      ? `/chuyenvien/vanbandi-detail.html?id=${doc.id}`
      : `/chuyenvien/vanbanden-detail.html?id=${doc.id}`;

    li.innerHTML = `
      <div>
        <a href="${docUrl}" class="font-medium text-slate-700 hover:text-blue-600 block">
          ${helpers.escapeHtml(doc.document_code || "—")}
        </a>
        <div class="text-[12px] text-slate-500 line-clamp-1">
          ${helpers.escapeHtml(doc.title || doc.subject || "—")}
        </div>
      </div>
      <span class="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 whitespace-nowrap">
        ${doc.direction === 'di' ? 'Đi' : 'Đến'}
      </span>
    `;
    container.appendChild(li);
  });
}

// --- Metrics ---
function updateTaskMetrics(tasks) {
  if (!tasks) return;
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'DONE' || t.status === 'Hoàn thành').length;
  const overdue = tasks.filter(t => {
    if (t.status === 'DONE' || !t.due_at) return false;
    return new Date(t.due_at) < new Date();
  }).length;
  const open = total - completed;

  setText('[data-case-metric="tasks-completed"]', `${completed} / ${total}`);
  setText('[data-case-metric="tasks-overdue"]', overdue);
  setText('[data-case-metric="tasks-open"]', open);
}

function updateDocMetrics(docs) {
  if (!docs) return;
  setText('[data-case-metric="docs-count"]', docs.length);
}

// --- Interactions ---
function setupInteractions(caseId) {
  // Handle "Ghi nhật ký" button
  const btnAddActivity = $("[data-action='add-activity']");
  if (btnAddActivity) {
    btnAddActivity.addEventListener("click", () => {
      const note = prompt("Nhập nội dung nhật ký:");
      if (note && note.trim()) {
         postComment(caseId, note.trim());
      }
    });
  }

  // Handle "Đề nghị đóng" button
  const btnRequestClose = $("[data-action='request-close']");
  if (btnRequestClose) {
      btnRequestClose.addEventListener("click", async () => {
          if (!confirm("Bạn có chắc chắn muốn đề nghị đóng hồ sơ này?")) return;
          
          try {
              await api.request(`/api/v1/cases/${caseId}/request_close/`, {
                  method: "POST"
              });
              alert("Đã gửi đề nghị đóng hồ sơ.");
              window.location.reload();
          } catch (error) {
              alert("Lỗi đề nghị đóng: " + (error.message || error.detail || "Lỗi không xác định"));
          }
      });
  }
}

async function postComment(caseId, content) {
  try {
    await api.request("/api/v1/comments/", {
      method: "POST",
      body: {
        entity_type: "case",
        entity_id: caseId,
        content: content
      }
    });
    // Reload logs
    loadActivityLogsAndComments(caseId);
  } catch (e) {
    console.error("Error posting comment:", e);
    alert("Không thể gửi nhật ký: " + e.message);
  }
}

// Complete a task (mark as DONE)
async function completeTask(taskId) {
  // Only allow task modification when case is actively being executed
  if (preloadedCase) {
    const statusCode = preloadedCase.status?.code || preloadedCase.status?.name || preloadedCase.status || "";
    const normalizedStatus = statusCode ? String(statusCode).toUpperCase().trim().replace(/\s+/g, '_') : "";
    
    if (normalizedStatus !== 'DANG_THUC_HIEN') {
      alert("Chỉ có thể thay đổi nhiệm vụ khi hồ sơ đang ở trạng thái Đang xử lý.");
      return;
    }
  }
  
  if (!confirm("Bạn có chắc chắn muốn đánh dấu nhiệm vụ này là hoàn thành?")) {
    return;
  }
  
  try {
    await api.request(`/api/v1/tasks/${taskId}/`, {
      method: "PATCH",
      body: {
        status: "DONE"
      }
    });
    
    // Reload tasks
    if (currentCaseId) {
      await loadTasks(currentCaseId);
    }
    
    alert("Đã đánh dấu nhiệm vụ hoàn thành.");
  } catch (error) {
    console.error("Error completing task:", error);
    alert("Lỗi khi đánh dấu hoàn thành: " + (error.message || error.detail || "Lỗi không xác định"));
  }
}

// Toggle task status (Complete/Undo) - called from task modal  
async function toggleTaskStatus(taskId, newStatus) {
  // Only allow task modification when case is actively being executed
  if (preloadedCase) {
    const statusCode = preloadedCase.status?.code || preloadedCase.status?.name || preloadedCase.status || "";
    const normalizedStatus = statusCode ? String(statusCode).toUpperCase().trim().replace(/\s+/g, '_') : "";
    
    if (normalizedStatus !== 'DANG_THUC_HIEN') {
      alert("Chỉ có thể thay đổi nhiệm vụ khi hồ sơ đang ở trạng thái Đang xử lý.");
      return;
    }
  }
  
  try {
    await api.request(`/api/v1/case-tasks/${taskId}/`, {
      method: "PATCH",
      body: {
        status: newStatus
      }
    });
    
    // Close modal and reload tasks
    const modal = document.getElementById("modalTaskDetail");
    if (modal) modal.close();
    
    if (currentCaseId) {
      await loadTasks(currentCaseId);
    }
    
    showToast(
      newStatus === "DONE" ? "Đã đánh dấu hoàn thành" : "Đã huỷ hoàn thành",
      "success"
    );
  } catch (error) {
    console.error("Error toggling task status:", error);
    alert("Lỗi khi cập nhật trạng thái: " + (error.message || error.detail || "Lỗi không xác định"));
  }
}

// --- Helpers ---
function getStatusColor(code) {
  const normalized = code ? String(code).toUpperCase().trim().replace(/\s+/g, '_') : '';
  const map = {
    'MOI_TAO': 'bg-slate-100 text-slate-700',
    'DANG_THUC_HIEN': 'bg-blue-50 text-blue-700',
    'CHO_DUYET_DONG': 'bg-amber-50 text-amber-700',
    'DONG': 'bg-emerald-50 text-emerald-700',
    'TAM_DUNG': 'bg-rose-50 text-rose-700',
    'LUU_TRU': 'bg-gray-100 text-gray-600'
  };
  return map[normalized] || 'bg-slate-100 text-slate-700';
}

function getPriorityLabel(p) {
  const map = {
    LOW: "Thấp",
    MEDIUM: "Trung bình",
    HIGH: "Cao",
    URGENT: "Khẩn cấp",
  };
  const pUpper = p ? String(p).toUpperCase() : "";
  return map[pUpper] || p || "Bình thường";
}

function getPriorityColor(p) {
  const map = {
    LOW: "bg-slate-100 text-slate-700",
    MEDIUM: "bg-blue-50 text-blue-700",
    HIGH: "bg-amber-100 text-amber-700",
    URGENT: "bg-rose-100 text-rose-700",
  };
  const pUpper = p ? String(p).toUpperCase() : "";
  return map[pUpper] || "bg-slate-100 text-slate-700";
}

function getRoleLabel(role) {
  const map = {
    'OWNER': 'Người tạo',
    'LEADER': 'Chủ trì',
    'MEMBER': 'Thành viên',
    'WATCHER': 'Theo dõi'
  };
  return map[role] || role;
}

function getTaskStatusColor(status) {
  if (status === 'DONE' || status === 'Hoàn thành') return 'bg-emerald-100 text-emerald-700';
  if (status === 'TODO') return 'bg-slate-100 text-slate-700';
  if (status === 'IN_PROGRESS') return 'bg-blue-100 text-blue-700';
  return 'bg-slate-100 text-slate-700';
}

// Expose for HTML onclick
window.openTaskDetail = openTaskDetail;
window.deleteTaskAttachment = deleteTaskAttachment;
window.handleTaskAttachmentUpload = handleTaskAttachmentUpload;
window.toggleTaskStatus = toggleTaskStatus;

// Setup event listeners for action buttons
function setupInteractions(caseId) {
  // Submit button (MOI_TAO -> CHO_PHAN_CONG)
  const btnSubmit = $("[data-action='submit']");
  if (btnSubmit) {
    btnSubmit.addEventListener("click", async () => {
      await handleSubmit(caseId);
    });
  }

  // Request Close button (DANG_THUC_HIEN -> CHO_DUYET_DONG)
  const btnRequestClose = $("[data-action='request-close']");
  if (btnRequestClose) {
    btnRequestClose.addEventListener("click", async () => {
      await handleRequestClose(caseId);
    });
  }

  // Activity log button
  const btnAddActivity = $("[data-action='add-activity']");
  if (btnAddActivity) {
    btnAddActivity.addEventListener("click", () => {
      const note = prompt("Nhập nội dung nhật ký:");
      if (note && note.trim()) {
        postComment(caseId, note.trim());
      }
    });
  }
}

// Handle Submit action (MOI_TAO -> CHO_PHAN_CONG)
async function handleSubmit(caseId) {
  const note = prompt("Ghi chú khi trình lãnh đạo (không bắt buộc):");
  
  if (note === null) return; // User cancelled
  
  try {
    await api.request(`/api/v1/cases/${caseId}/submit/`, {
      method: "POST",
      body: note ? { note } : {}
    });
    
    showToast("Đã trình hồ sơ lên lãnh đạo!", "success");
    
    // Reload page after short delay
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  } catch (error) {
    console.error("Error submitting case:", error);
    alert("Lỗi khi trình hồ sơ: " + (error.message || error.detail || "Lỗi không xác định"));
  }
}

// Handle Request Close action (DANG_THUC_HIEN -> CHO_DUYET_DONG)
async function handleRequestClose(caseId) {
  const note = prompt("Lý do đề nghị đóng hồ sơ (không bắt buộc):");
  
  if (note === null) return; // User cancelled
  
  try {
    await api.request(`/api/v1/cases/${caseId}/request_close/`, {
      method: "POST",
      body: note ? { note } : {}
    });
    
    showToast("Đã gửi đề nghị đóng hồ sơ!", "success");
    
    // Reload page after short delay
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  } catch (error) {
    console.error("Error requesting close:", error);
    alert("Lỗi khi đề nghị đóng: " + (error.message || error.detail || "Lỗi không xác định"));
  }
}

// Post activity log
async function postComment(caseId, content) {
  try {
    await api.request("/api/v1/comments/", {
      method: "POST",
      body: {
        entity_type: "case",
        entity_id: caseId,
        content: content
      }
    });
    // Reload activity logs
    loadActivityLogsAndComments(caseId);
    showToast("Đã thêm nhật ký!", "success");
  } catch (e) {
    console.error("Error posting comment:", e);
    alert("Không thể gửi nhật ký: " + (e.message || e.detail || "Lỗi không xác định"));
  }
}
