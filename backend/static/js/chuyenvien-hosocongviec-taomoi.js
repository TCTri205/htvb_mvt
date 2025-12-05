// chuyenvien-hosocongviec-taomoi.js
// Specialist case creation - uses FORM SUBMISSION (MVT), not REST API

(function () {
  'use strict';

  function onReady(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  onReady(function() {
    console.log('[chuyenvien-hosocongviec-taomoi] Script loaded and DOM ready');
    
    const $ = (s, r = document) => r.querySelector(s);

    // Set default due date (7 days from now)
    const dueInput = $('#caseDue');
    if (dueInput) {
      const today = new Date();
      today.setDate(today.getDate() + 7);
      dueInput.value = today.toISOString().split('T')[0];
    }

    // Attachment handling
    const btnAddAttachment = $('#btnAddAttachment');
    const fileInput = $('#fileAttachment');
    
    if (btnAddAttachment && fileInput) {
      btnAddAttachment.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', handleFileSelect);
    }

    function handleFileSelect(event) {
      const files = Array.from(event.target.files);
      if (files.length === 0) return;

      // Validate file sizes
      let hasError = false;
      files.forEach(file => {
        // Check file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          showToast(`Tệp "${file.name}" quá lớn (tối đa 10MB)`, 'error');
          hasError = true;
        }
      });

      if (hasError) {
        // Clear the file input if there's an error
        event.target.value = '';
        renderAttachmentList();
        return;
      }

      // Render the list of selected files (without clearing input)
      renderAttachmentList();
    }

    function renderAttachmentList() {
      const list = $('#attachmentList');
      if (!list) return;

      const fileInput = $('#fileAttachment');
      if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        list.innerHTML = '<li class="text-center text-sm text-slate-500 py-4">Chưa có tệp đính kèm</li>';
        return;
      }

      list.innerHTML = '';
      Array.from(fileInput.files).forEach((file, index) => {
        const li = document.createElement('li');
        li.className = 'flex items-center justify-between p-3 border border-slate-200 rounded-md';
        const sizeKB = Math.max(1, Math.round(file.size / 1024));
        li.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="text-blue-600">📎</span>
            <div>
              <div class="text-sm font-medium text-slate-700">${escapeHtml(file.name)}</div>
              <div class="text-xs text-slate-500">${sizeKB} KB</div>
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

    window.removeAttachment = function(index) {
      const fileInput = $('#fileAttachment');
      if (!fileInput || !fileInput.files) return;
      
      // Create a new FileList without the removed file
      const dt = new DataTransfer();
      Array.from(fileInput.files).forEach((file, i) => {
        if (i !== index) {
          dt.items.add(file);
        }
      });
      fileInput.files = dt.files;
      
      renderAttachmentList();
    };

    // Form validation
    function validateForm() {
      const title = $('#caseTitle')?.value?.trim();
      const due = $('#caseDue')?.value;
      const leader = $('#caseLeader')?.value;

      if (!title) {
        return { ok: false, msg: 'Vui lòng nhập tiêu đề hồ sơ' };
      }
      if (!due) {
        return { ok: false, msg: 'Vui lòng chọn hạn hoàn thành' };
      }
      if (!leader) {
        return { ok: false, msg: 'Vui lòng chọn người chủ trì' };
      }

      return { ok: true };
    }

    // Form submission handler
    function submitCase({ draft = false } = {}) {
      console.log('[chuyenvien-hosocongviec-taomoi] submitCase called with draft:', draft);
      
      const validation = validateForm();
      if (!validation.ok) {
        showToast(validation.msg, 'error');
        return;
      }

      const formEl = $('#createCaseForm');
      if (!formEl) {
        showToast('Không tìm thấy form tạo hồ sơ.', 'error');
        console.error('[chuyenvien-hosocongviec-taomoi] Form element #createCaseForm NOT FOUND!');
        return;
      }

      // Disable buttons during submission
      const btnCreate = $('#btnCreateCase');
      const btnDraft = $('#btnSaveDraft');
      [btnCreate, btnDraft].forEach((b) => {
        if (b) b.disabled = true;
      });
      if (btnCreate) btnCreate.textContent = 'Đang gửi...';
      if (btnDraft) btnDraft.textContent = 'Đang lưu...';

      try {
        // Set the action URL for form submission
        const actionUrl = '/chuyenvien/hosocongviec-taomoi/';
        formEl.setAttribute('action', actionUrl);

        // Add draft field if needed
        let draftInput = formEl.querySelector('input[name="is_draft"]');
        if (!draftInput) {
          draftInput = document.createElement('input');
          draftInput.type = 'hidden';
          draftInput.name = 'is_draft';
          formEl.appendChild(draftInput);
        }
        draftInput.value = draft ? '1' : '';

        console.log('[chuyenvien-hosocongviec-taomoi] Submitting form to:', actionUrl);
        
        // Use standard form POST for MVT workflow
        formEl.submit();
      } catch (err) {
        console.error('[chuyenvien-hosocongviec-taomoi] Error submitting form:', err);
        showToast(err?.message || 'Không thể gửi hồ sơ. Vui lòng thử lại.', 'error');
        
        // Re-enable buttons
        [btnCreate, btnDraft].forEach((b) => {
          if (b) {
            b.disabled = false;
            b.textContent = b.id === 'btnCreateCase' ? 'Tạo hồ sơ' : 'Lưu nháp';
          }
        });
      }
    }

    // Button event listeners
    const formEl = $('#createCaseForm');
    if (formEl) {
      console.log('[chuyenvien-hosocongviec-taomoi] Form element found, adding submit listener');
      formEl.addEventListener('submit', (e) => {
        console.log('[chuyenvien-hosocongviec-taomoi] Form submitted');
        e.preventDefault();
        submitCase({ draft: false });
      });
    } else {
      console.error('[chuyenvien-hosocongviec-taomoi] Form element #createCaseForm NOT FOUND!');
    }

    const btnDraft = $('#btnSaveDraft');
    if (btnDraft) {
      console.log('[chuyenvien-hosocongviec-taomoi] Save Draft button found, adding click listener');
      btnDraft.addEventListener('click', (e) => {
        console.log('[chuyenvien-hosocongviec-taomoi] Save Draft button clicked');
        e.preventDefault();
        submitCase({ draft: true });
      });
    } else {
      console.error('[chuyenvien-hosocongviec-taomoi] Button #btnSaveDraft NOT FOUND!');
    }

    const btnCreateCase = $('#btnCreateCase');
    if (btnCreateCase) {
      console.log('[chuyenvien-hosocongviec-taomoi] Create Case button found');
      btnCreateCase.addEventListener('click', (e) => {
        console.log('[chuyenvien-hosocongviec-taomoi] Create Case button clicked');
        e.preventDefault();
        submitCase({ draft: false });
      });
    } else {
      console.error('[chuyenvien-hosocongviec-taomoi] Button #btnCreateCase NOT FOUND!');
    }

    // Toast notification
    function showToast(msg, type = 'success') {
      const toast = $('#toast');
      if (!toast) {
        alert(msg);
        return;
      }
      toast.textContent = msg;
      toast.classList.remove('toast--error', 'toast--show');
      if (type === 'error') toast.classList.add('toast--error');
      setTimeout(() => toast.classList.add('toast--show'), 10);
      setTimeout(() => toast.classList.remove('toast--show'), 2400);
    }

    // HTML escape utility
    function escapeHtml(value) {
      return (value || '')
        .toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    console.log('[chuyenvien-hosocongviec-taomoi] Initialization complete');
  });
})();
