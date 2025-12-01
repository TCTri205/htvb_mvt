/* ============================================================
   lanhdao-hosocongviec-taomoi.js
   Dedicated script for case creation page
   Fixes the bug where button event listeners were not registered
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
    console.log('[hosocongviec-taomoi] Script loaded and DOM ready');
    
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    const api = window.ApiClient;
    if (!api) {
      console.error('[hosocongviec-taomoi] ApiClient not found');
      alert('Lỗi: ApiClient chưa được load. Vui lòng reload trang.');
      return;
    }

    console.log('[hosocongviec-taomoi] ApiClient found:', api);
    console.log('[hosocongviec-taomoi] api.cases:', api.cases);

    const memNameSelect = $('#memNameSelect');
    const memName = $('#memName');
    const memUnit = $('#memUnit');
    const memRole = $('#memRole');
    const caseDept = $('#caseDept');

    const todayIso = () => new Date().toISOString().slice(0, 10);
    const taskAssignee = $('#taskAssignee');

    function toArray(payload) {
      if (!payload) return [];
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(payload.items)) return payload.items;
      if (Array.isArray(payload.results)) return payload.results;
      return [];
    }

    function getSelectedDepartmentId() {
      if (!caseDept) return null;
      const selectedOption = caseDept.options[caseDept.selectedIndex];
      const departmentId = selectedOption?.dataset?.departmentId;
      return departmentId ? parseInt(departmentId, 10) : null;
    }

    function getCurrentUserProfile() {
      // Try to get profile from API first, then Layout.user
      let profile = null;
      if (api?.getCurrentUser) {
        try {
          profile = api.getCurrentUser();
        } catch (e) {
          console.warn('[hosocongviec-taomoi] api.getCurrentUser() error:', e);
        }
      }
      
      if (!profile || Object.keys(profile).length === 0) {
        profile = window.Layout?.user || {};
      }
      
      // Debug: log the actual profile object
      console.log('[hosocongviec-taomoi] Raw profile object:', profile);
      console.log('[hosocongviec-taomoi] Profile keys:', Object.keys(profile));
      
      // Try multiple possible field names for userId
      // Django User model has user_id as UUIDField primary key
      const userId = 
        profile.user_id || 
        profile.userId || 
        profile.pk ||      // Django often uses 'pk' for primary key
        profile.id || 
        profile.uid ||
        null;
      
      console.log('[hosocongviec-taomoi] Extracted userId:', userId);
      
      // If still no userId, try to get from request.user in Layout
      if (!userId && window.Layout?.currentUser) {
        const currentUser = window.Layout.currentUser;
        console.log('[hosocongviec-taomoi] Trying Layout.currentUser:', currentUser);
        const fallbackId = currentUser.user_id || currentUser.pk || currentUser.id;
        if (fallbackId) {
          console.log('[hosocongviec-taomoi] Found userId from Layout.currentUser:', fallbackId);
          return {
            userId: fallbackId,
            fullName: currentUser.full_name || currentUser.fullName || '',
            departmentName: currentUser.department_name || currentUser.department?.name || '',
          };
        }
      }
      
      return {
        userId: userId,
        fullName:
          profile.full_name ||
          profile.fullName ||
          profile.name ||
          profile.username ||
          '',
        departmentName:
          profile.department_name ||
          profile.department?.name ||
          profile.department ||
          '',
      };
    }

    function setMemberSelectState({ placeholder, disabled }) {
      if (!memNameSelect) return;
      memNameSelect.innerHTML = `<option value="">${
        placeholder || 'Chọn thành viên'
      }</option>`;
      memNameSelect.disabled = Boolean(disabled);
      if (memName) memName.value = '';
      if (memUnit) memUnit.value = '';
    }

    function renderMemberOptions(list, role) {
      if (!memNameSelect) return;
      const isAssignee = role === 'Người được giao';
      const items = Array.isArray(list) ? list : [];
      if (!items.length) {
        memNameSelect.innerHTML = `<option value="">Không có ${
          isAssignee ? 'chuyên viên' : 'văn thư'
        } phù hợp</option>`;
        return;
      }
      memNameSelect.innerHTML = `<option value="">-- Chọn ${
        isAssignee ? 'chuyên viên' : 'văn thư'
      } --</option>`;
      items.forEach((item) => {
        const option = document.createElement('option');
        const userId = item?.user_id || item?.id || item?.userId || '';
        const deptName =
          item?.department_name || item?.department?.name || item?.department || '';
        const fullName =
          item?.full_name || item?.fullName || item?.name || item?.username || userId;
        option.value = String(userId);
        option.textContent = deptName ? `${fullName} (${deptName})` : fullName;
        option.dataset.fullName = fullName;
        option.dataset.departmentName = deptName || '';
        option.dataset.userId = option.value;
        memNameSelect.appendChild(option);
      });
      memNameSelect.disabled = false;
    }

    function loadMembersForRole(role) {
      if (!memNameSelect) return Promise.resolve([]);
      const normalized = (role || '').trim();
      if (!normalized) {
        setMemberSelectState({ placeholder: 'Chọn vai trò trước', disabled: true });
        return Promise.resolve([]);
      }
      const isAssignee = normalized === 'Người được giao';
      const client = isAssignee ? api?.specialists : api?.clerks;
      if (!client?.list) {
        setMemberSelectState({
          placeholder: 'Không tải được danh sách',
          disabled: true,
        });
        return Promise.resolve([]);
      }

      memNameSelect.disabled = true;
      memNameSelect.innerHTML = '<option value="">Đang tải...</option>';

      const params = { ordering: 'full_name' };
      const departmentId = getSelectedDepartmentId();
      if (departmentId) {
        params.department_id = departmentId;
      }

      return client
        .list(params)
        .then((payload) => {
          const items = toArray(payload);
          renderMemberOptions(items, normalized);
          return items;
        })
        .catch((error) => {
          console.warn('[hosocongviec-taomoi] Lỗi tải danh sách thành viên:', error);
          setMemberSelectState({
            placeholder: 'Không tải được danh sách',
            disabled: true,
          });
          return [];
        })
        .finally(() => {
          memNameSelect.disabled = false;
        });
    }

    // Defaults
    (function preset() {
      const createdAtField = $('#caseCreatedAt');
      if (createdAtField) {
        createdAtField.value = todayIso();
      }
      const current = getCurrentUserProfile();
      const leaderField = $('#caseLeader');
      if (leaderField) {
        leaderField.value = current.fullName || 'Lãnh đạo';
      }
    })();

    // Load members when department changes
    if (caseDept) {
      caseDept.addEventListener('change', () => {
        const roleValue = memRole?.value || '';
        if (roleValue) {
          loadMembersForRole(roleValue);
        }

        // Reset specialist selection
        if (memNameSelect) {
          memNameSelect.value = '';
          if (memName) memName.value = '';
          if (memUnit) memUnit.value = '';
        }
      });
    }

    // Auto-fill name and unit when specialist is selected
    if (memRole) {
      memRole.addEventListener('change', () => {
        const roleValue = memRole.value;
        setMemberSelectState({
          placeholder: roleValue
            ? 'Đang tải danh sách...'
            : 'Chọn vai trò trước',
          disabled: !roleValue,
        });
        if (roleValue) {
          loadMembersForRole(roleValue);
        }
      });
    }

    // Auto-fill name and unit when member is selected
    if (memNameSelect) {
      memNameSelect.addEventListener('change', () => {
        const selectedOption =
          memNameSelect.options[memNameSelect.selectedIndex];
        if (selectedOption && selectedOption.value) {
          const fullName = selectedOption.dataset.fullName || '';
          const departmentName = selectedOption.dataset.departmentName || '';

          if (memName) memName.value = fullName;
          if (memUnit) memUnit.value = departmentName;
        } else {
          if (memName) memName.value = '';
          if (memUnit) memUnit.value = '';
        }
      });
    }

    // Initial state for member select
    setMemberSelectState({ placeholder: 'Chọn vai trò trước', disabled: true });

    // Members
    const memberTbody = $('#memberTable tbody');
    function renderMemberRow({ name, role, unit, join }, idx) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
              <td class="px-5 py-3">${
                name || '-'
              }<div class="text-[12px] text-slate-500">${
        unit ? unit : ''
      }</div></td>
              <td class="px-5 py-3"><span class="chip ${
                role === 'Chủ trì'
                  ? 'chip--blue'
                  : role === 'Người được giao'
                  ? 'chip--green'
                  : 'chip--default'
              }">${role}</span></td>
              <td class="px-5 py-3">${unit || '-'}</td>
              <td class="px-5 py-3">${join || '-'}</td>
              <td class="px-5 py-3 text-right">
                <button type="button" class="text-[13px] text-rose-600 hover:underline" data-remove-member="${idx}">Xoá</button>
              </td>
            `;
      return tr;
    }
    const members = [];

    // Add default leader as member (Chủ trì) - only if userId is available
    (function addDefaultLeader() {
      const current = getCurrentUserProfile();
      console.log('[hosocongviec-taomoi] Current user profile:', current);
      
      // Only add leader if we have a valid userId
      if (current.userId) {
        members.push({
          id: current.userId,
          name: current.fullName || 'Lãnh đạo',
          role: 'Chủ trì',
          unit: current.departmentName || '—',
          join: todayIso(),
        });
        console.log('[hosocongviec-taomoi] Added default leader member with ID:', current.userId);
      } else {
        console.warn('[hosocongviec-taomoi] No userId found, skipping default leader');
      }
      syncMembers();
    })();

    function syncMembers() {
      if (!memberTbody) return;
      memberTbody.innerHTML = '';
      members.forEach((m, i) => memberTbody.appendChild(renderMemberRow(m, i)));
      updateTaskAssigneeOptions();
    }

    const btnAddMember = $('#btnAddMember');
    if (btnAddMember) {
      btnAddMember.addEventListener('click', () => {
        const memNameSelectEl = $('#memNameSelect');
        const selectedOption =
          memNameSelectEl?.options[memNameSelectEl?.selectedIndex];
        const role = memRole?.value || '';

        if (!role) {
          return showToast('Vui lòng chọn vai trò trước.', 'error');
        }
        if (!selectedOption || !selectedOption.value) {
          return showToast(
            `Vui lòng chọn ${
              role === 'Theo dõi' ? 'văn thư' : 'chuyên viên'
            }.`,
            'error'
          );
        }

        const memberId = selectedOption.dataset.userId || selectedOption.value;
        const name =
          selectedOption.dataset.fullName || $('#memName')?.value?.trim() || '';
        const unit =
          selectedOption.dataset.departmentName ||
          $('#memUnit')?.value?.trim() ||
          '';
        const join = $('#memJoin').value || todayIso();

        if (!name) {
          return showToast('Vui lòng chọn thành viên hợp lệ.', 'error');
        }

        const existed = members.some(
          (m) =>
            m.id &&
            memberId &&
            String(m.id).toLowerCase() === String(memberId).toLowerCase()
        );
        if (existed) {
          return showToast('Thành viên đã được thêm.', 'warn');
        }

        members.push({ id: memberId, name, role, unit, join });

        // Reset form
        if (memNameSelectEl) memNameSelectEl.value = '';
        if (memName) memName.value = '';
        if (memUnit) memUnit.value = '';
        const memJoinEl = $('#memJoin');
        if (memJoinEl) memJoinEl.value = '';

        syncMembers();
        showToast('Đã thêm thành viên.');
      });
    }

    if (memberTbody) {
      memberTbody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-remove-member]');
        if (!btn) return;
        const idx = +btn.dataset.removeMember;
        members.splice(idx, 1);
        syncMembers();
        showToast('Đã xoá thành viên.');
      });
    }

    // Tasks
    const tasks = [];

    function updateTaskAssigneeOptions() {
      if (!taskAssignee) return;
      taskAssignee.innerHTML = '';
      const eligible =
        members.filter((m) => m.role !== 'Theo dõi') || members;
      const source = eligible.length ? eligible : members;
      if (!source.length) {
        taskAssignee.innerHTML =
          '<option value="">Chưa có thành viên</option>';
        taskAssignee.disabled = true;
        return;
      }
      taskAssignee.disabled = false;
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '-- Chọn thành viên --';
      taskAssignee.appendChild(placeholder);
      source.forEach((m) => {
        const option = document.createElement('option');
        option.value = m.id ? String(m.id) : m.name || '';
        option.textContent = m.unit ? `${m.name} (${m.unit})` : m.name || '';
        taskAssignee.appendChild(option);
      });
    }

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
                  <div class="text-[12px] text-slate-500">Phụ trách: ${
                    t.assignee || '-'
                  } • Hạn: ${t.due || '-'}</div>
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
        const assigneeEl = taskAssignee;
        const assigneeId = assigneeEl?.value || '';
        const assigneeName =
          assigneeEl?.options?.[assigneeEl.selectedIndex]?.textContent?.trim() ||
          '';
        const due = $('#taskDue').value;
        const status = $('#taskStatus').value;
        if (!title) return showToast('Vui lòng nhập Tên nhiệm vụ.', 'error');
        if (!assigneeId)
          return showToast('Vui lòng chọn người phụ trách.', 'error');
        tasks.push({ title, assignee: assigneeName, assigneeId, due, status });
        $('#taskTitle').value = '';
        if (assigneeEl) assigneeEl.value = '';
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
        showToast('Đã ghi nhật');
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
        // so sánh theo ngày (bỏ giờ)
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
      const leader = $('#caseLeader').value.trim();
      if (!title) return { ok: false, msg: 'Vui lòng nhập Tiêu đề hồ sơ.' };
      if (!dept) return { ok: false, msg: 'Vui lòng chọn Phòng phụ trách.' };
      if (!due) return { ok: false, msg: 'Vui lòng chọn Hạn hoàn thành.' };
      if (!leader) return { ok: false, msg: 'Vui lòng nhập Người chủ trì.' };
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
      const leaderMember = members.find((m) => m.role === 'Chủ trì');
      
      // Validate leader_id - must be a valid UUID or undefined
      let leaderId = leaderMember?.id;
      if (leaderId) {
        // Check if it's a valid UUID format (simple check)
        const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(leaderId));
        if (!isValidUUID) {
          console.warn('[hosocongviec-taomoi] Invalid leader ID format, setting to undefined:', leaderId);
          leaderId = undefined;
        }
      }
      
      const participants = members
        .filter((m) => m.role !== 'Chủ trì')
        .map((m) => ({
          user_id: m.id,
          role_on_case:
            m.role === 'Người được giao'
              ? 'assignee'
              : m.role === 'Theo dõi'
              ? 'watcher'
              : 'coowner',
        }));
      const tasksPayload = tasks.map((t) => ({
        title: t.title,
        assignee_id: t.assigneeId,
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
        participants,
        tasks: tasksPayload,
      };
      
      // Only include leader_id if we have a valid one
      // If not provided, backend will use request.user as leader (views.py line 280-281)
      if (leaderId) {
        payload.leader_id = leaderId;
      }
      
      return payload;
    }

    function resolveCreateAction(formEl) {
      const attr = formEl?.getAttribute('action');
      if (attr && attr.trim()) return attr;
      const role = document.body?.dataset?.role || '';
      if (role === 'lanhdao') return '/lanhdao/hosocongviec-taomoi/';
      if (role === 'vanthu') return '/vanthu/hosocongviec-taomoi/';
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
      console.log('[hosocongviec-taomoi] submitCase called with draft:', draft);
      
      const v = validateForm();
      if (!v.ok) {
        showToast(v.msg, 'error');
        return;
      }
      
      const btnCreate = $('#btnCreateAssign');
      const btnDraft = $('#btnSaveDraft');
      [btnCreate, btnDraft].forEach((b) => {
        if (b) b.disabled = true;
      });
      if (btnCreate) btnCreate.textContent = 'Đang gửi...';
      if (btnDraft) btnDraft.textContent = 'Đang lưu...';

      const payload = buildCasePayload();
      payload.is_draft = Boolean(draft);

      console.log('[hosocongviec-taomoi] Form payload (preview only, will submit via MVT):', payload);

      try {
        const formEl = $('#createCaseForm');
        if (!formEl) {
          throw new Error('Không tìm thấy form tạo hồ sơ.');
        }
        const actionUrl = resolveCreateAction(formEl);
        formEl.setAttribute('action', actionUrl);
        ensureDraftField(formEl, draft);
        // Standard form POST keeps server-side workflow & redirects in control
        formEl.submit();
      } catch (err) {
        console.error('[hosocongviec-taomoi] Lỗi khi gửi form tạo hồ sơ:', err);
        const msg =
          err?.message || 
          'Không thể gửi hồ sơ. Vui lòng thử lại.';
        showToast(msg, 'error');
      } finally {
        [btnCreate, btnDraft].forEach((b) => {
          if (b) {
            b.disabled = false;
            b.textContent =
              b.id === 'btnCreateAssign' ? 'Tạo & giao việc' : 'Lưu nháp';
          }
        });
      }
    }

    const formEl = $('#createCaseForm');
    if (formEl) {
      console.log('[hosocongviec-taomoi] Form element found, adding submit listener');
      formEl.addEventListener('submit', (e) => {
        console.log('[hosocongviec-taomoi] Form submitted');
        e.preventDefault();
        submitCase({ draft: false });
      });
    } else {
      console.error('[hosocongviec-taomoi] Form element #createCaseForm NOT FOUND!');
    }

    const btnDraft = $('#btnSaveDraft');
    if (btnDraft) {
      console.log('[hosocongviec-taomoi] Save Draft button found, adding click listener');
      btnDraft.addEventListener('click', (e) => {
        console.log('[hosocongviec-taomoi] Save Draft button clicked');
        e.preventDefault();
        submitCase({ draft: true });
      });
    } else {
      console.error('[hosocongviec-taomoi] Button #btnSaveDraft NOT FOUND!');
    }

    const btnCreateAssign = $('#btnCreateAssign');
    if (btnCreateAssign) {
      console.log('[hosocongviec-taomoi] Create & Assign button found');
    } else {
      console.error('[hosocongviec-taomoi] Button #btnCreateAssign NOT FOUND!');
    }

    // Đồng bộ KPI ban đầu
    syncMembers();
    syncTasks();
    syncLogs();
    syncFiles();
    syncDocs();

    console.log('[hosocongviec-taomoi] Initialization complete');
  });
})();
