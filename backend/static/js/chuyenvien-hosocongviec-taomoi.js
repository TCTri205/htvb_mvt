// chuyenvien-hosocongviec-taomoi.js
const api = window.ApiClient;
const helpers = window.DocHelpers;

let attachments = [];

document.addEventListener("DOMContentLoaded", () => {
  initForm();
  setupEventListeners();
});

function initForm() {
  // Set default due date (7 days from now)
  const dueInput = document.getElementById("caseDue");
  if (dueInput) {
    const today = new Date();
    today.setDate(today.getDate() + 7);
    dueInput.value = today.toISOString().split('T')[0];
  }
}

function setupEventListeners() {
  // Save draft button
  const btnSaveDraft = document.getElementById("btnSaveDraft");
  if (btnSaveDraft) {
    btnSaveDraft.addEventListener("click", handleSaveDraft);
  }

  // Create case button
  const btnCreateCase = document.getElementById("btnCreateCase");
  if (btnCreateCase) {
    btnCreateCase.addEventListener("click", handleCreateCase);
  }

  // Attachment button
  const btnAddAttachment = document.getElementById("btnAddAttachment");
  const fileInput = document.getElementById("fileAttachment");
  if (btnAddAttachment && fileInput) {
    btnAddAttachment.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", handleFileSelect);
  }
}

function collectFormData() {
  const form = document.getElementById("createCaseForm");
  if (!form) return null;

  const formData = {
    title: document.getElementById("caseTitle")?.value?.trim(),
    case_code: document.getElementById("caseCode")?.value?.trim() || null,
    case_type: document.getElementById("caseType")?.value || null,
    priority: document.getElementById("casePriority")?.value || "MEDIUM",
    due_date: document.getElementById("caseDue")?.value || null,
    description: document.getElementById("caseDesc")?.value?.trim() || null,
  };

  return formData;
}

async function handleSaveDraft() {
  const formData = collectFormData();
  
  if (!formData.title) {
    alert("Vui lòng nhập tiêu đề hồ sơ");
    return;
  }

  try {
    const response = await api.request("/api/v1/cases/", {
      method: "POST",
      body: formData
    });

    alert("Đã lưu hồ sơ dự thảo!");
    // Redirect to detail page
    window.location.href = `/chuyenvien/hosocongviec-detail.html?id=${response.case_id}`;
  } catch (error) {
    console.error("Error saving draft:", error);
    alert("Lỗi khi lưu nháp: " + (error.message || error.detail || "Lỗi không xác định"));
  }
}

async function handleCreateCase() {
  const formData = collectFormData();

  // Validation
  if (!formData.title) {
    alert("Vui lòng nhập tiêu đề hồ sơ");
    document.getElementById("caseTitle")?.focus();
    return;
  }

  if (!formData.due_date) {
    alert("Vui lòng chọn hạn hoàn thành");
    document.getElementById("caseDue")?.focus();
    return;
  }

  try {
    // Create case
    const response = await api.request("/api/v1/cases/", {
      method: "POST",
      body: formData
    });

    const caseId = response.case_id;

    // Upload attachments if any
    if (attachments.length > 0) {
      await uploadAttachments(caseId);
    }

    alert("Đã tạo hồ sơ thành công! Bạn có thể trình lãnh đạo ở trang chi tiết.");
    // Redirect to detail page
    window.location.href = `/chuyenvien/hosocongviec-detail.html?id=${caseId}`;
  } catch (error) {
    console.error("Error creating case:", error);
    alert("Lỗi khi tạo hồ sơ: " + (error.message || error.detail || "Lỗi không xác định"));
  }
}

function handleFileSelect(event) {
  const files = Array.from(event.target.files);
  if (files.length === 0) return;

  files.forEach(file => {
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert(`Tệp "${file.name}" quá lớn (tối đa 10MB)`);
      return;
    }

    attachments.push(file);
  });

  renderAttachmentList();
  // Reset input
  event.target.value = "";
}

function renderAttachmentList() {
  const list = document.getElementById("attachmentList");
  if (!list) return;

  if (attachments.length === 0) {
    list.innerHTML = '<li class="text-center text-sm text-slate-500 py-4">Chưa có tệp đính kèm</li>';
    return;
  }

  list.innerHTML = "";
  attachments.forEach((file, index) => {
    const li = document.createElement("li");
    li.className = "flex items-center justify-between p-3 border border-slate-200 rounded-md";
    li.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="text-blue-600">📎</span>
        <div>
          <div class="text-sm font-medium text-slate-700">${helpers.escapeHtml(file.name)}</div>
          <div class="text-xs text-slate-500">${formatFileSize(file.size)}</div>
        </div>
      </div>
      <button
        type="button"
        class="text-rose-600 hover:text-rose-700 text-sm"
        onclick="removeAttachment(${index})"
      >
        Xóa
      </button>
    `;
    list.appendChild(li);
  });
}

function removeAttachment(index) {
  attachments.splice(index, 1);
  renderAttachmentList();
}

async function uploadAttachments(caseId) {
  const uploadPromises = attachments.map(async (file) => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      await api.request(`/api/v1/cases/${caseId}/attachments/`, {
        method: "POST",
        body: formData,
        isFormData: true
      });
    } catch (error) {
      console.error(`Error uploading ${file.name}:`, error);
      // Don't throw - allow other uploads to continue
    }
  });

  await Promise.allSettled(uploadPromises);
}

function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
}

// Expose to global scope for onclick handlers
window.removeAttachment = removeAttachment;
