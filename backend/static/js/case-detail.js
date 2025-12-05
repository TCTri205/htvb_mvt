(function () {
  const api = window.ApiClient;
  if (!api) {
    console.warn('[case-detail] ApiClient không sẵn sàng; bỏ qua việc tải chi tiết hồ sơ.');
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const caseId = params.get('id') || document.body?.dataset?.caseId;
  const caseData = readCaseData();
  if (!caseId) {
    console.warn('[case-detail] Thiếu id hồ sơ trong querystring hoặc body dataset.');
    return;
  }

  const selectors = {
    title: '[data-case-title] ',
    description: '[data-case-description]',
    code: '[data-case-code]',
    type: '[data-case-type]',
    department: '[data-case-department]',
    owner: '[data-case-owner]',
    leader: '[data-case-leader]',
    status: '[data-case-status]',
    due: '[data-case-due]',
    created: '[data-case-created]',
    taskCount: '[data-case-task-count]',
    membersBody: '#case-members-body',
    tasksList: '#case-tasks-list',
    activityList: '#case-activity-list',
    progressDone: '#case-progress-completed',
    progressOverdue: '#case-progress-overdue',
    progressDocs: '#case-progress-docs',
    progressPending: '#case-progress-pending',
  };

  function setText(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.textContent = value ?? '';
  }

  function escapeHtml(value) {
    if (!value) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderMembers(list) {
    const tbody = document.querySelector(selectors.membersBody);
    if (!tbody) return;
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="px-5 py-4 text-[13px] text-slate-500">Chưa có thành viên cập nhật.</td></tr>';
      return;
    }
    tbody.innerHTML = list
      .map((entry) => {
        const user = entry.user || {};
        const name = escapeHtml(user.full_name || user.username || 'Người dùng');
        const role = escapeHtml(entry.role_on_case || 'Thành viên');
        const unit = escapeHtml(entry.department?.name || entry.department_name || 'Chưa rõ');
        const joined = entry.joined_at || entry.created_at || '';
        return `<tr>
          <td class="px-5 py-3"><div class="" role="presentation">${name}<div class="text-[12px] text-slate-500">${escapeHtml(role)}</div></div></td>
          <td class="px-5 py-3"><span class="chip chip--info">${role}</span></td>
          <td class="px-5 py-3">${unit}</td>
          <td class="px-5 py-3">${joined ? joined.slice(0, 10) : '—'}</td>
        </tr>`;
      })
      .join('');
  }

  function renderTasks(list) {
    const ul = document.querySelector(selectors.tasksList);
    if (!ul) return;
    if (!list.length) {
      ul.innerHTML = '<li class="text-[13px] text-slate-500">Chưa có nhiệm vụ.</li>';
      return;
    }
    ul.innerHTML = list
      .map((task) => {
        const title = escapeHtml(task.title || 'Nhiệm vụ');
        const assignee = escapeHtml(task.assignee?.full_name || task.assignee?.username || 'Chưa có');
        const due = escapeHtml(task.due_at || 'Chưa có');
        const status = escapeHtml(task.status || task.status_name || 'Đang xử lý');
        const badge = status.toLowerCase().includes('done')
          ? '<span class="chip chip--green">Hoàn tất</span>'
          : '<span class="chip chip--default">Chưa xong</span>';
        return `<li class="rounded-lg border border-slate-100 p-3">
          <div class="flex items-center justify-between gap-2">
            <div>
              <div class="font-medium text-slate-700">${title}</div>
              <div class="text-[12px] text-slate-500">${assignee} · Hạn: ${due}</div>
            </div>
            <div>${badge}</div>
          </div>
        </li>`;
      })
      .join('');
  }

  function renderActivity(list) {
    const ul = document.querySelector(selectors.activityList);
    if (!ul) return;
    if (!list.length) {
      ul.innerHTML = '<li class="text-[13px] text-slate-500">Chưa có hoạt động.</li>';
      return;
    }
    ul.innerHTML = list
      .map((entry) => {
        const actor = escapeHtml(entry.actor?.full_name || entry.actor?.username || 'Hệ thống');
        const action = escapeHtml(entry.action || entry.activity || 'Hoạt động');
        const note = escapeHtml(entry.note || entry.meta || '');
        const time = escapeHtml((entry.at || entry.created_at || '').slice(0, 16).replace('T', ' '));
        return `<li class="rounded-lg border border-slate-100 p-3">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-slate-700">${time}</span>
            <span class="text-[12px] text-slate-500">${actor}</span>
          </div>
          <div class="text-[13px] text-slate-600 mt-1">${action}</div>
          ${note ? `<p class="mt-2 text-[12px] text-slate-500">${note}</p>` : ''}
        </li>`;
      })
      .join('');
  }

  function updateProgress(tasks, detail) {
    if (tasks && tasks.length) {
      const total = tasks.length;
      const done = tasks.filter((task) => (task.status || task.status_name || '').toLowerCase().includes('done')).length;
      const overdue = tasks.filter((task) => {
        const due = new Date(task.due_at);
        return due instanceof Date && !Number.isNaN(due.getTime()) && Date.now() > due.getTime() && !(task.status || task.status_name || '').toLowerCase().includes('done');
      }).length;
      if (document.querySelector(selectors.progressDone))
        document.querySelector(selectors.progressDone).textContent = `${done} / ${total}`;
      if (document.querySelector(selectors.progressOverdue))
        document.querySelector(selectors.progressOverdue).textContent = String(overdue);
      if (document.querySelector(selectors.progressPending))
        document.querySelector(selectors.progressPending).textContent = String(total - done);
    }
    if (document.querySelector(selectors.progressDocs)) {
      const docs = detail?.case_documents?.length || detail?.documents?.length || detail?.case_documents_count || 0;
      document.querySelector(selectors.progressDocs).textContent = String(docs);
    }
  }

  function normalizeText(value) {
    return (value || '')
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function updateMetadata(detail) {
    setText(selectors.title, detail?.title || 'Hồ sơ công việc');
    setText(selectors.description, detail?.description || detail?.goal || detail?.instruction || '');
    setText(selectors.code, detail?.case_code || detail?.code || `HS-${detail?.case_id ?? ''}`);
    setText(selectors.type, detail?.case_type?.case_type_name || detail?.case_type?.name || '');
    setText(selectors.department, detail?.department?.name || detail?.department?.department_code || '');
    setText(selectors.leader, detail?.leader?.full_name || detail?.leader?.username || '');
    setText(selectors.owner, detail?.owner?.full_name || detail?.owner?.username || '');
    setText(selectors.status, detail?.status?.case_status_name || '');
    setText(selectors.due, detail?.deadline || detail?.due_date || '');
    setText(selectors.created, detail?.created_at || '');
    setText(selectors.taskCount, String(detail?.case_tasks?.length || 0));
  }

  function renderListFallback(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (container) {
      container.innerHTML = '<li class="text-[13px] text-slate-500">Chưa có dữ liệu.</li>';
    }
  }

  if (!caseData) {
    console.warn('[case-detail] Thiếu case-data được nhúng từ MVT.');
    renderListFallback(selectors.tasksList);
    renderListFallback(selectors.activityList);
    return;
  }

  Promise.all([
    Promise.resolve(caseData),
    api.cases.tasks(caseId).catch(() => []),
    api.cases.participants(caseId).catch(() => []),
    api.cases.activityLogs(caseId).catch(() => []),
  ]).then(([detail, tasks, participants, logs]) => {
    updateMetadata(detail);
    renderMembers(participants);
    renderTasks(Array.isArray(tasks) ? tasks : []);
    renderActivity(Array.isArray(logs) ? logs : []);
    updateProgress(Array.isArray(tasks) ? tasks : [], detail);
  });

  function readCaseData() {
    const script = document.getElementById('case-data');
    if (!script) return null;
    try {
      return JSON.parse(script.textContent || '{}');
    } catch (error) {
      console.error('[case-detail] Không parse được case-data:', error);
      return null;
    }
  }
})();
