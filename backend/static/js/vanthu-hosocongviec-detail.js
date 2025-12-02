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
  const preloaded = readCaseData();
  if (preloaded) {
    renderCaseInfo(preloaded);
  }
  loadCaseDetail(caseId, preloaded);
});

const api = window.ApiClient;
const helpers = window.DocHelpers;

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

// Helper to safely set text content
function setText(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.textContent = value || "—";
}

// Helper to get element
function $(selector) {
  return document.querySelector(selector);
}

async function loadCaseDetail(caseId, preloaded) {
  const loadMeta = async () => preloaded || null;
  try {
    const data = await loadMeta();
    if (data) {
      renderCaseInfo(data);
    }

    await Promise.allSettled([
      loadParticipants(caseId),
      loadTasks(caseId),
      loadActivityLogsAndComments(caseId),
      loadRelatedDocs(caseId)
    ]);

    // VT has no workflow actions - setupInteractions not needed
    // setupInteractions(caseId);

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
  
  if (data.assignees && data.assignees.length > 0) {
     setText("[data-case-assignee]", data.assignees.map(u => u.full_name).join(", "));
  } else {
     setText("[data-case-assignee]", "—");
  }

  setText("[data-case-deadline]", helpers.formatDate(data.due_date));
  setText("[data-case-created]", helpers.formatDate(data.created_at));

  // Status Chip
  const statusEl = $("[data-case-status-chip]");
  // Normalize status code: uppercase and replace spaces with underscores
  const rawCode = data.status?.code || data.status?.case_status_name || "";
  const statusCode = rawCode ? String(rawCode).toUpperCase().trim().replace(/\s+/g, '_') : "";

  if (statusEl) {
    statusEl.textContent = getStatusLabel(statusCode);
    statusEl.className = "px-2.5 py-1 rounded-full text-xs font-semibold " + getStatusColor(statusCode);
  }

  // Priority Chip
  const priorityEl = $("[data-case-priority-chip]");
  if (priorityEl) {
    priorityEl.textContent = getPriorityLabel(data.priority);
    priorityEl.className = "px-2.5 py-1 rounded-full text-xs font-semibold " + getPriorityColor(data.priority);
  }

  // Assignees (pre-rendered list)
  if (Array.isArray(data.assignees) && data.assignees.length) {
    if (target) {
      target.textContent = data.assignees.map((u) => u.full_name || u.username || u.id).join(", ");
    }
  }

  updateActionButtons(statusCode);
}

// VT Role: Read-Only (Archive Only) - No workflow actions
function updateActionButtons(statusCode) {
    // Văn thư has no workflow action buttons
    // All buttons remain hidden as VT is read-only
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
    container.appendChild(li);
  });
  
  setText("[data-case-task-count]", `${list.length} nhiệm vụ`);
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
    
    // LINK ADJUSTED FOR VANTHU
    const docUrl = doc.direction === 'di' 
      ? `/vanthu/vanbandi-detail.html?id=${doc.id}`
      : `/vanthu/vanbanden-detail.html?id=${doc.id}`;

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

  // Handle Submit (Trình lãnh đạo)
  const btnSubmit = $("#btnSubmit");
  if (btnSubmit) {
    btnSubmit.addEventListener("click", async () => {
      await handleSubmitAction(caseId);
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

// --- Helpers ---
function getStatusColor(code) {
  const normalized = code ? String(code).toUpperCase().trim().replace(/\s+/g, '_') : '';
  const map = {
    'MOI_TAO': 'bg-blue-50 text-blue-700',
    'CHO_PHAN_CONG': 'bg-amber-50 text-amber-700',
    'DA_PHAN_CONG': 'bg-purple-50 text-purple-700',
    'DANG_THUC_HIEN': 'bg-emerald-50 text-emerald-700',
    'TAM_DUNG': 'bg-slate-50 text-slate-700',
    'CHO_DUYET_DONG': 'bg-orange-50 text-orange-700',
    'DONG': 'bg-gray-50 text-gray-700'
  };
  return map[normalized] || 'bg-slate-50 text-slate-700';
}

function getStatusLabel(code) {
  const normalized = code ? String(code).toUpperCase().trim().replace(/\s+/g, '_') : '';
  const map = {
    'MOI_TAO': 'Mới tạo',
    'CHO_PHAN_CONG': 'Chờ phân công',
    'DA_PHAN_CONG': 'Đã phân công',
    'DANG_THUC_HIEN': 'Đang thực hiện',
    'TAM_DUNG': 'Tạm dừng',
    'CHO_DUYET_DONG': 'Chờ duyệt đóng',
    'DONG': 'Đã đóng'
  };
  return map[normalized] || code || '—';
}

function getPriorityLabel(p) {
  if (!p) return "Thường";
  const pUpper = String(p).toUpperCase();
  const map = {
    'HIGH': 'Cao',
    'MEDIUM': 'Trung bình',
    'LOW': 'Thấp',
    'URGENT': 'Khẩn',
    '4': 'Khẩn',
    '3': 'Cao',
    '2': 'Trung bình',
    '1': 'Thấp'
  };
  return map[pUpper] || map[String(p)] || "Thường";
}

function getPriorityColor(p) {
  if (!p) return "bg-slate-100 text-slate-700";
  const pUpper = String(p).toUpperCase();
  if (pUpper === 'URGENT' || p === 4 || p === '4') return "bg-rose-100 text-rose-700";
  if (pUpper === 'HIGH' || p === 3 || p === '3') return "bg-orange-100 text-orange-700";
  if (pUpper === 'MEDIUM' || p === 2 || p === '2') return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

function getRoleLabel(role) {
  const map = {
    'owner': 'Người tạo',
    'coowner': 'Đồng chủ trì',
    'assignee': 'Người được giao',
    'watcher': 'Theo dõi'
  };
  return map[role?.toLowerCase()] || role || '—';
}

function getTaskStatusColor(status) {
  if (status === 'DONE' || status === 'Hoàn thành') return 'bg-emerald-100 text-emerald-700';
  if (status === 'IN_PROGRESS') return 'bg-blue-100 text-blue-700';
  if (status === 'CANCELLED') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-700';
}

// --- Toast Notification ---
function showToast(message, type = 'success') {
  const toast = $('#toast');
  const toastMessage = $('#toastMessage');
  
  if (!toast || !toastMessage) return;
  
  toastMessage.textContent = message;
  
  // Set color based on type
  const colors = {
    'success': 'bg-emerald-600 text-white',
    'error': 'bg-rose-600 text-white',
    'info': 'bg-blue-600 text-white',
    'warning': 'bg-amber-600 text-white'
  };
  
  toast.className = `fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg transition-all duration-300 z-50 ${colors[type] || colors.success}`;
  
  // Show toast
  toast.style.transform = 'translateY(0)';
  toast.style.opacity = '1';
  
  // Auto hide after 3 seconds
  setTimeout(() => {
    toast.style.transform = 'translateY(20px)';
    toast.style.opacity = '0';
  }, 3000);
}

// VT Role: Read-Only (Archive Only)
// Submit action handler removed - VT users cannot perform workflow actions
// Văn thư chỉ xem và lưu trữ hồ sơ, không thể trình/phân công/duyệt
