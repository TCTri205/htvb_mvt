/* ============================================================
   vanthu-hosocongviec-taomoi.js
   Case creation script for Văn thư role
   Simplified version without member management
============================================================ */

(function () {
  'use strict';

  // Wait for DOM to be ready
  function onReady(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  onReady(function() {
    console.log('[vanthu-hosocongviec-taomoi] Script loaded and DOM ready');
    
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    const api = window.ApiClient;
    if (!api) {
      console.error('[vanthu-hosocongviec-taomoi] ApiClient not found');
      alert('Lỗi: ApiClient chưa được load. Vui lòng reload trang.');
      return;
    }

    console.log('[vanthu-hosocongviec-taomoi] ApiClient found:', api);

    const todayIso = () => new Date().toISOString().slice(0, 10);

    // Defaults
    (function preset() {
      const createdAtField = $('#caseCreatedAt');
      if (createdAtField) {
        createdAtField.value = todayIso();
      }
    })();

    // Tasks (NO assignee for VT)
    const tasks = [];

    function taskChip(status) {
      if (status === 'Hoàn thành') return 'chip chip--green';
      if (status === 'Đang làm') return 'chip chip--amber';
      return 'chip chip--default';
    }
    
    function renderTaskItem(t, idx) {
      const li = document.createElement('li');
      li.className = 'rounded-lg border border-slate-100 p-3';
      li.innerHTML = `
              <div class="flex items-center justify-between gap-2">
                <div>
                  <div class="font-medium text-slate-700">${t.title}</div>
                  <div class="text-[12px] text-slate-500">Hạn: ${
                    t.due || '-'
                  }</div>
                </div>
                <div class="flex items-center gap-3">
                  <span class="${taskChip(t.status)}">${t.status}</span>
                  <button type="button" class="text-[13px] text-rose-600 hover:underline" data-remove-task="${idx}">Xoá</button>
                </div>
              </div>
            `;
      return li;
    }
    
    function syncTasks() {
      const list = $('#taskList');
      if (!list) return;
      const emptyTemplate = $('#taskEmpty');
      list.innerHTML = '';
      if (!tasks.length) {
        if (emptyTemplate) {
          const clone = emptyTemplate.cloneNode(true);
          clone.id = 'taskEmptyClone';
          list.appendChild(clone);
        }
        updateKPI();
        return;
      }
      tasks.forEach((t, i) => list.appendChild(renderTaskItem(t, i)));
      updateKPI();
    }
    
    const btnAddTask = $('#btnAddTask');
    if (btnAddTask) {
      btnAddTask.addEventListener('click', () => {
        const title = $('#taskTitle').value.trim();
        const due = $('#taskDue').value;
        const status = $('#taskStatus').value;
        if (!title) return showToast('Vui lòng nhập Tên nhiệm vụ.', 'error');
        tasks.push({ title, due, status });
        $('#taskTitle').value = '';
        $('#taskDue').value = '';
        $('#taskStatus').value = 'Chưa bắt đầu';
        syncTasks();
        showToast('Đã thêm nhiệm vụ.');
      });
    }
    
    const taskList = $('#taskList');
    if (taskList) {
      taskList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-remove-task]');
        if (!btn) return;
        const idx = +btn.dataset.removeTask;
        tasks.splice(idx, 1);
        syncTasks();
        showToast('Đã xoá nhiệm vụ.');
      });
    }

    // Logs
    const logs = [];
    function renderLogItem(l, idx) {
      const li = document.createElement('li');
      li.className = 'rounded-lg border border-slate-100 p-3';
      li.innerHTML = `
              <div class="flex items-center justify-between">
                <span class="font-semibold text-slate-700">${
                  l.when || '—'
                } • NHẬT KÝ</span>
                <button type="button" class="text-[13px] text-rose-600 hover:underline" data-remove-log="${idx}">Xoá</button>
              </div>
              <p class="mt-1 text-[12.5px] text-slate-600">${l.content}</p>
            `;
      return li;
    }
    
    function syncLogs() {
      const list = $('#logList');
      if (!list) return;
      list.innerHTML = '';
      if (!logs.length) {
        const emptyTemplate = $('#logEmpty');
        if (emptyTemplate) {
          const clone = emptyTemplate.cloneNode(true);
          clone.id = 'logEmptyClone';
          list.appendChild(clone);
        }
        return;
      }
      logs.forEach((l, i) => list.appendChild(renderLogItem(l, i)));
    }
    
    const btnAddLog = $('#btnAddLog');
    if (btnAddLog) {
      btnAddLog.addEventListener('click', () => {
        const content = $('#logContent').value.trim();
        const when = $('#logWhen').value;
        if (!content)
          return showToast('Vui lòng nhập nội dung nhật ký.', 'error');
        logs.push({ content, when });
        $('#logContent').value = '';
        $('#logWhen').value = '';
        syncLogs();
        showToast('Đã ghi nhật ký.');
      });
    }
    
    const logList = $('#logList');
    if (logList) {
      logList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-remove-log]');
        if (!btn) return;
        const idx = +btn.dataset.removeLog;
        logs.splice(idx, 1);
        syncLogs();
        showToast('Đã xoá nhật ký.');
      });
    }

    // Files
    const files = [];
    const fileInput = $('#fileInput');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const list = Array.from(e.target.files || []);
        list.forEach((f) => files.push({ name: f.name, size: f.size }));
        syncFiles();
        e.target.value = '';
        showToast('Đã thêm tệp đính kèm.');
      });
    }
    
    function renderFileItem(f, idx) {
      const li = document.createElement('li');
      li.className =
        'rounded-lg border border-slate-100 p-3 flex items-center justify-between gap-3';
      const sizeKB = Math.max(1, Math.round(f.size / 1024));
      li.innerHTML = `
              <div>
                <div class="font-medium text-slate-700">${f.name}</div>
                <div class="text-[12px] text-slate-500">${sizeKB} KB</div>
              </div>
              <div class="flex items-center gap-2">
                <button class="btn-icon" title="Tải xuống" aria-label="Tải xuống ${f.name}">⬇</button>
                <button class="text-[13px] text-rose-600 hover:underline" data-remove-file="${idx}">Xoá</button>
              </div>
            `;
      return li;
    }
    
    function syncFiles() {
      const list = $('#fileList');
      if (!list) return;
      list.innerHTML = '';
      if (!files.length) {
        const emptyTemplate = $('#fileEmpty');
        if (emptyTemplate) {
          const clone = emptyTemplate.cloneNode(true);
          clone.id = 'fileEmptyClone';
          list.appendChild(clone);
        }
      } else {
        files.forEach((f, i) => list.appendChild(renderFileItem(f, i)));
      }
      updateKPI();
    }
    
    const fileList = $('#fileList');
    if (fileList) {
      fileList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-remove-file]');
        if (!btn) return;
        const idx = +btn.dataset.removeFile;
        files.splice(idx, 1);
        syncFiles();
        showToast('Đã xoá tệp.');
      });
    }

    // Docs
    const docs = [];
    function renderDocItem(d, idx) {
      const li = document.createElement('li');
      li.className =
        'rounded-lg border border-slate-100 p-3 flex items-center justify-between gap-3';
      li.innerHTML = `
              <div>
                <div class="font-medium text-slate-700">${d.code || '—'} • ${
        d.type
      }</div>
                <div class="text-[12px] text-slate-500">Đã gắn vào hồ sơ</div>
              </div>
              <button class="text-[13px] text-rose-600 hover:underline" data-remove-doc="${idx}">Gỡ</button>
            `;
      return li;
    }
    
    function syncDocs() {
      const list = $('#docList');
      if (!list) return;
      list.innerHTML = '';
      if (!docs.length) {
        const emptyTemplate = $('#docEmpty');
        if (emptyTemplate) {
          const clone = emptyTemplate.cloneNode(true);
          clone.id = 'docEmptyClone';
          list.appendChild(clone);
        }
      } else {
        docs.forEach((d, i) => list.appendChild(renderDocItem(d, i)));
      }
      updateKPI();
    }
    
    const btnAddDoc = $('#btnAddDoc');
    if (btnAddDoc) {
      btnAddDoc.addEventListener('click', () => {
        const code = $('#docCode').value.trim();
        const type = $('#docType').value;
        if (!code) return showToast('Vui lòng nhập Số/Ký hiệu văn bản.', 'error');
        docs.push({ code, type });
        $('#docCode').value = '';
        syncDocs();
        showToast('Đã gắn văn bản.');
      });
    }
    
    const docList = $('#docList');
    if (docList) {
      docList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-remove-doc]');
        if (!btn) return;
        const idx = +btn.dataset.removeDoc;
        docs.splice(idx, 1);
        syncDocs();
        showToast('Đã gỡ văn bản.');
      });
    }

    // KPI updater
    function updateKPI() {
      const total = tasks.length;
      const done = tasks.filter((t) => t.status === 'Hoàn thành').length;
      const late = tasks.filter((t) => {
        if (!t.due || t.status === 'Hoàn thành') return false;
        const d = new Date(t.due);
        const today = new Date();
        d.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        return d < today;
      }).length;

      const kpiDone = $('#kpiDone');
      const kpiLate = $('#kpiLate');
      const kpiDocs = $('#kpiDocs');
      const kpiFiles = $('#kpiFiles');
      
      if (kpiDone) kpiDone.textContent = `${done} / ${total}`;
      if (kpiLate) kpiLate.textContent = late;
      if (kpiDocs) kpiDocs.textContent = docs.length;
      if (kpiFiles) kpiFiles.textContent = files.length;
    }

    // Toast
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

    // Validate + submit
    function validateForm() {
      const title = $('#caseTitle').value.trim();
      const dept = $('#caseDept').value.trim();
      const due = $('#caseDue').value;
      if (!title) return { ok: false, msg: 'Vui lòng nhập Tiêu đề hồ sơ.' };
      if (!dept) return { ok: false, msg: 'Vui lòng chọn Phòng phụ trách.' };
      if (!due) return { ok: false, msg: 'Vui lòng chọn Hạn hoàn thành.' };
      return { ok: true };
    }

    function mapTaskStatus(label) {
      const normalized = (label || '').toLowerCase();
      if (normalized.includes('hoàn')) return 'DONE';
      if (normalized.includes('đang')) return 'IN_PROGRESS';
      return 'OPEN';
    }

    function buildCasePayload() {
      const deptSelect = $('#caseDept');
      const deptOption = deptSelect?.options?.[deptSelect.selectedIndex];
      const departmentId = deptOption?.dataset?.departmentId || '';
      
      // VT cannot set participants or leader - backend will auto-assign
      const tasksPayload = tasks.map((t) => ({
        title: t.title,
        // NO assignee_id for VT
        status: mapTaskStatus(t.status),
        due_date: t.due || null,
      }));

      const payload = {
        title: $('#caseTitle').value.trim(),
        case_code: $('#caseCode').value.trim() || undefined,
        description: $('#caseDesc').value.trim() || undefined,
        case_type: $('#caseType')?.value || undefined,
        priority: $('#casePriority')?.value || undefined,
        department_id: departmentId || undefined,
        due_date: $('#caseDue')?.value || undefined,
        participants: [], // VT cannot add participants
        tasks: tasksPayload,
      };
      
      // NO leader_id - backend will use request.user
      
      return payload;
    }

    function resolveCreateAction(formEl) {
      const attr = formEl?.getAttribute('action');
      if (attr && attr.trim()) return attr;
      const role = document.body?.dataset?.role || '';
      if (role === 'vanthu') return '/vanthu/hosocongviec-taomoi/';
      if (role === 'lanhdao') return '/lanhdao/hosocongviec-taomoi/';
      return window.location?.pathname || '/hosocongviec/taomoi/';
    }

    function ensureDraftField(formEl, draft) {
      if (!formEl) return;
      let draftInput = formEl.querySelector('input[name=\"is_draft\"]');
      if (!draftInput) {
        draftInput = document.createElement('input');
        draftInput.type = 'hidden';
        draftInput.name = 'is_draft';
        formEl.appendChild(draftInput);
      }
      draftInput.value = draft ? '1' : '';
    }

    function submitCase({ draft = false } = {}) {
      console.log('[vanthu-hosocongviec-taomoi] submitCase called with draft:', draft);
      
      const v = validateForm();
      if (!v.ok) {
        showToast(v.msg, 'error');
        return;
      }

      const formEl = $('#createCaseForm');
      if (!formEl) {
        showToast('Không tìm thấy form tạo hồ sơ.', 'error');
        console.error('[vanthu-hosocongviec-taomoi] Form element #createCaseForm NOT FOUND!');
        return;
      }
      
      const btnCreate = $('#btnCreateCase');
      const btnDraft = $('#btnSaveDraft');
      [btnCreate, btnDraft].forEach((b) => {
        if (b) b.disabled = true;
      });
      if (btnCreate) btnCreate.textContent = 'Đang gửi...';
      if (btnDraft) btnDraft.textContent = 'Đang lưu...';

      const payload = buildCasePayload();
      payload.is_draft = Boolean(draft);

      console.log('[vanthu-hosocongviec-taomoi] Form payload (preview only, will submit via MVT):', payload);

      try {
        const actionUrl = resolveCreateAction(formEl);
        formEl.setAttribute('action', actionUrl);
        ensureDraftField(formEl, draft);
        // Use standard form POST so server-side workflow & redirects handle case creation
        formEl.submit();
      } catch (err) {
        console.error('[vanthu-hosocongviec-taomoi] Lỗi khi gửi form tạo hồ sơ:', err);
        const msg =
          err?.message || 
          'Không thể gửi hồ sơ. Vui lòng thử lại.';
        showToast(msg, 'error');
      } finally {
        [btnCreate, btnDraft].forEach((b) => {
          if (b) {
            b.disabled = false;
            b.textContent =
              b.id === 'btnCreateCase' ? 'Tạo hồ sơ' : 'Lưu nháp';
          }
        });
      }
    }

    const formEl = $('#createCaseForm');
    if (formEl) {
      console.log('[vanthu-hosocongviec-taomoi] Form element found, adding submit listener');
      formEl.addEventListener('submit', (e) => {
        console.log('[vanthu-hosocongviec-taomoi] Form submitted');
        e.preventDefault();
        submitCase({ draft: false });
      });
    } else {
      console.error('[vanthu-hosocongviec-taomoi] Form element #createCaseForm NOT FOUND!');
    }

    const btnDraft = $('#btnSaveDraft');
    if (btnDraft) {
      console.log('[vanthu-hosocongviec-taomoi] Save Draft button found, adding click listener');
      btnDraft.addEventListener('click', (e) => {
        console.log('[vanthu-hosocongviec-taomoi] Save Draft button clicked');
        e.preventDefault();
        submitCase({ draft: true });
      });
    } else {
      console.error('[vanthu-hosocongviec-taomoi] Button #btnSaveDraft NOT FOUND!');
    }

    const btnCreateCase = $('#btnCreateCase');
    if (btnCreateCase) {
      console.log('[vanthu-hosocongviec-taomoi] Create Case button found');
    } else {
      console.error('[vanthu-hosocongviec-taomoi] Button #btnCreateCase NOT FOUND!');
    }

    // Initial sync
    syncTasks();
    syncLogs();
    syncFiles();
    syncDocs();

    console.log('[vanthu-hosocongviec-taomoi] Initialization complete');
  });
})();
