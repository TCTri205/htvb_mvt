/* ============================================================
   lanhdao.js
   Auto-generated from inline scripts to centralize logic per trang
   Không chỉnh sửa trực tiếp trong HTML nữa.
============================================================ */

(function () {
  const pageHandlers = {};

  onReady(() => {
    const page = detectPage();
    setupSidebar();
    const handler = pageHandlers[page];
    if (typeof handler === "function") {
      handler();
    }
  });

  function onReady(callback) {
    if (typeof callback !== "function") return;
    const run = () => {
      if (window.Layout?.isReady) {
        callback();
        return;
      }
      if (window.Layout) {
        window.addEventListener("layout:ready", callback, { once: true });
        return;
      }
      callback();
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      run();
    }
  }

  function runAfterDom(callback) {
    if (typeof callback !== "function") return;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  function detectPage() {
    const data = document.body?.dataset?.page;
    console.log('[lanhdao.js] detectPage - data-page:', data);
    if (data) {
      const normalized = data.toLowerCase();
      if (normalized === "dashboard-lanhdao") return "dashboard";
      return normalized;
    }
    const path = (location.pathname || "").split("/").pop() || "";
    return path.replace(/\.html$/i, "").toLowerCase();
  }

  function setupSidebar() {
    const btn =
      document.querySelector("#btnSidebar") ||
      document.querySelector("#btn-sidebar");
    const sidebar = document.querySelector("#sidebar");
    if (!btn || !sidebar) return;
    btn.addEventListener("click", () => {
      const open = sidebar.classList.toggle("is-open");
      sidebar.classList.toggle("hidden", !open);
      btn.setAttribute("aria-expanded", String(open));
    });
  }

  pageHandlers["dashboard"] = function () {
    // Tính % tiến độ từ KPI Done/Total
    const done = Number(document.getElementById("kpiDone")?.textContent || 0);
    const total = Number(document.getElementById("kpiTotal")?.textContent || 1);
    const rate = Math.round((done / total) * 100);

    const rateEl = document.getElementById("kpiRate");
    const bar = document.getElementById("unitProgressBar");
    const unitDone = document.getElementById("unitDone");
    const unitTotal = document.getElementById("unitTotal");

    if (rateEl) rateEl.textContent = rate + "%";
    if (bar) bar.style.width = rate + "%";
    if (unitDone) unitDone.textContent = done;
    if (unitTotal) unitTotal.textContent = total;

    // Điều hướng nhanh tới danh sách văn bản cần duyệt (văn bản đi)
    const btnAll = document.getElementById("btnViewAllApprove");
    if (btnAll) {
      btnAll.addEventListener("click", () => {
        window.location.href = "/lanhdao/vanbandi/";
      });
    }
  };

  pageHandlers["danhmuc"] = function () {
    const helper = window.CatalogPage && window.CatalogPage.initReadonlyCatalog;
    if (typeof helper === "function") {
      helper();
    } else {
      console.warn("[lanhdao] CatalogPage helper chưa sẵn sàng.");
    }

    const localSearch = document.querySelector("#dm-search");
    const globalSearch = document.querySelector("#global-search");
    if (localSearch && globalSearch) {
      globalSearch.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        localSearch.value = event.target.value || "";
        localSearch.dispatchEvent(new Event("input"));
      });
    }
  };

  pageHandlers["baocaothongke"] = function () {
    if (typeof window.initLanhDaoAnalytics === 'function') {
      window.initLanhDaoAnalytics();
    } else {
      console.warn('[lanhdao.js] Analytics module not loaded');
    }
  };

  pageHandlers["hosocongviec-taomoi"] = function () {
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    const api = window.ApiClient;
    const memNameSelect = $("#memNameSelect");
    const memName = $("#memName");
    const memUnit = $("#memUnit");
    const memRole = $("#memRole");
    const caseDept = $("#caseDept");

    const todayIso = () => new Date().toISOString().slice(0, 10);
    const taskAssignee = $("#taskAssignee");

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
      const profile =
        (api?.getCurrentUser && api.getCurrentUser()) || window.Layout?.user || {};
      return {
        userId: profile.user_id || profile.id || profile.userId || null,
        fullName:
          profile.full_name ||
          profile.fullName ||
          profile.name ||
          profile.username ||
          "",
        departmentName:
          profile.department_name ||
          profile.department?.name ||
          profile.department ||
          "",
      };
    }

    function setMemberSelectState({ placeholder, disabled }) {
      if (!memNameSelect) return;
      memNameSelect.innerHTML = `<option value="">${
        placeholder || "Chọn thành viên"
      }</option>`;
      memNameSelect.disabled = Boolean(disabled);
      if (memName) memName.value = "";
      if (memUnit) memUnit.value = "";
    }

    function renderMemberOptions(list, role) {
      if (!memNameSelect) return;
      const isAssignee = role === "Người được giao";
      const items = Array.isArray(list) ? list : [];
      if (!items.length) {
        memNameSelect.innerHTML = `<option value="">Không có ${
          isAssignee ? "chuyên viên" : "văn thư"
        } phù hợp</option>`;
        return;
      }
      memNameSelect.innerHTML = `<option value="">-- Chọn ${
        isAssignee ? "chuyên viên" : "văn thư"
      } --</option>`;
      items.forEach((item) => {
        const option = document.createElement("option");
        const userId = item?.user_id || item?.id || item?.userId || "";
        const deptName =
          item?.department_name || item?.department?.name || item?.department || "";
        const fullName =
          item?.full_name || item?.fullName || item?.name || item?.username || userId;
        option.value = String(userId);
        option.textContent = deptName ? `${fullName} (${deptName})` : fullName;
        option.dataset.fullName = fullName;
        option.dataset.departmentName = deptName || "";
        option.dataset.userId = option.value;
        memNameSelect.appendChild(option);
      });
      memNameSelect.disabled = false;
    }

    function loadMembersForRole(role) {
      if (!memNameSelect) return Promise.resolve([]);
      const normalized = (role || "").trim();
      if (!normalized) {
        setMemberSelectState({ placeholder: "Chọn vai trò trước", disabled: true });
        return Promise.resolve([]);
      }
      const isAssignee = normalized === "Người được giao";
      const client = isAssignee ? api?.specialists : api?.clerks;
      if (!client?.list) {
        setMemberSelectState({
          placeholder: "Không tải được danh sách",
          disabled: true,
        });
        return Promise.resolve([]);
      }

      memNameSelect.disabled = true;
      memNameSelect.innerHTML = '<option value="">Đang tải...</option>';

      const params = { ordering: "full_name" };
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
          console.warn("[lanhdao] Lỗi tải danh sách thành viên:", error);
          setMemberSelectState({
            placeholder: "Không tải được danh sách",
            disabled: true,
          });
          return [];
        })
        .finally(() => {
          memNameSelect.disabled = false;
        });
    }

    // Sidebar toggle (mobile)
    (function setupSidebarToggle() {
      const sidebar = $("#sidebar");
      const btnSidebar = $("#btnSidebar") || $("#btn-sidebar");
      if (!sidebar || !btnSidebar) return;
      btnSidebar.addEventListener("click", () => {
        const open = sidebar.classList.toggle("is-open");
        sidebar.classList.toggle("hidden", !open);
        btnSidebar.setAttribute("aria-expanded", String(open));
      });
    })();

    // Defaults
    (function preset() {
      $("#caseCreatedAt").value = todayIso();
      const current = getCurrentUserProfile();
      $("#caseLeader").value = current.fullName || "Lãnh đạo"; // mặc định theo tài khoản lãnh đạo
    })();

    // Load members when department changes
    if (caseDept) {
      caseDept.addEventListener("change", () => {
        const roleValue = memRole?.value || "";
        if (roleValue) {
          loadMembersForRole(roleValue);
        }

        // Reset specialist selection
        if (memNameSelect) {
          memNameSelect.value = "";
          memName.value = "";
          memUnit.value = "";
        }
      });
    }

    // Auto-fill name and unit when specialist is selected
    if (memRole) {
      memRole.addEventListener("change", () => {
        const roleValue = memRole.value;
        setMemberSelectState({
          placeholder: roleValue
            ? "Đang tải danh sách..."
            : "Chọn vai trò trước",
          disabled: !roleValue,
        });
        if (roleValue) {
          loadMembersForRole(roleValue);
        }
      });
    }

    // Auto-fill name and unit when member is selected
    if (memNameSelect) {
      memNameSelect.addEventListener("change", () => {
        const selectedOption =
          memNameSelect.options[memNameSelect.selectedIndex];
        if (selectedOption && selectedOption.value) {
          const fullName = selectedOption.dataset.fullName || "";
          const departmentName = selectedOption.dataset.departmentName || "";

          if (memName) memName.value = fullName;
          if (memUnit) memUnit.value = departmentName;
        } else {
          if (memName) memName.value = "";
          if (memUnit) memUnit.value = "";
        }
      });
    }

    // Initial state for member select
    setMemberSelectState({ placeholder: "Chọn vai trò trước", disabled: true });

    // Members
    const memberTbody = $("#memberTable tbody");
    function renderMemberRow({ name, role, unit, join }, idx) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
              <td class="px-5 py-3">${
                name || "-"
              }<div class="text-[12px] text-slate-500">${
        unit ? unit : ""
      }</div></td>
              <td class="px-5 py-3"><span class="chip ${
                role === "Chủ trì"
                  ? "chip--blue"
                  : role === "Người được giao"
                  ? "chip--green"
                  : "chip--default"
              }">${role}</span></td>
              <td class="px-5 py-3">${unit || "-"}</td>
              <td class="px-5 py-3">${join || "-"}</td>
              <td class="px-5 py-3 text-right">
                <button type="button" class="text-[13px] text-rose-600 hover:underline" data-remove-member="${idx}">Xoá</button>
              </td>
            `;
      return tr;
    }
    const members = [];

    // Add default leader as member (Chủ trì)
    (function addDefaultLeader() {
      const current = getCurrentUserProfile();
      members.push({
        id: current.userId || "leader",
        name: current.fullName || "Lãnh đạo",
        role: "Chủ trì",
        unit: current.departmentName || "—",
        join: todayIso(),
      });
      syncMembers();
    })();

    function syncMembers() {
      if (!memberTbody) return;
      memberTbody.innerHTML = "";
      members.forEach((m, i) => memberTbody.appendChild(renderMemberRow(m, i)));
      updateTaskAssigneeOptions();
    }

    const btnAddMember = $("#btnAddMember");
    if (btnAddMember) {
      btnAddMember.addEventListener("click", () => {
        const memNameSelectEl = $("#memNameSelect");
        const selectedOption =
          memNameSelectEl?.options[memNameSelectEl?.selectedIndex];
        const role = memRole?.value || "";

        if (!role) {
          return showToast("Vui lòng chọn vai trò trước.", "error");
        }
        if (!selectedOption || !selectedOption.value) {
          return showToast(
            `Vui lòng chọn ${
              role === "Theo dõi" ? "văn thư" : "chuyên viên"
            }.`,
            "error"
          );
        }

        const memberId = selectedOption.dataset.userId || selectedOption.value;
        const name =
          selectedOption.dataset.fullName || $("#memName")?.value?.trim() || "";
        const unit =
          selectedOption.dataset.departmentName ||
          $("#memUnit")?.value?.trim() ||
          "";
        const join = $("#memJoin").value || todayIso();

        if (!name) {
          return showToast("Vui lòng chọn thành viên hợp lệ.", "error");
        }

        const existed = members.some(
          (m) =>
            m.id &&
            memberId &&
            String(m.id).toLowerCase() === String(memberId).toLowerCase()
        );
        if (existed) {
          return showToast("Thành viên đã được thêm.", "warn");
        }

        members.push({ id: memberId, name, role, unit, join });

        // Reset form
        if (memNameSelectEl) memNameSelectEl.value = "";
        if (memName) memName.value = "";
        if (memUnit) memUnit.value = "";
        if ($("#memJoin")) $("#memJoin").value = "";

        syncMembers();
        showToast("Đã thêm thành viên.");
      });
    }

    if (memberTbody) {
      memberTbody.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-remove-member]");
        if (!btn) return;
        const idx = +btn.dataset.removeMember;
        members.splice(idx, 1);
        syncMembers();
        showToast("Đã xoá thành viên.");
      });
    }

    // Tasks
    const tasks = [];

    function updateTaskAssigneeOptions() {
      if (!taskAssignee) return;
      taskAssignee.innerHTML = "";
      const eligible =
        members.filter((m) => m.role !== "Theo dõi") || members;
      const source = eligible.length ? eligible : members;
      if (!source.length) {
        taskAssignee.innerHTML =
          '<option value="">Chưa có thành viên</option>';
        taskAssignee.disabled = true;
        return;
      }
      taskAssignee.disabled = false;
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "-- Chọn thành viên --";
      taskAssignee.appendChild(placeholder);
      source.forEach((m) => {
        const option = document.createElement("option");
        option.value = m.id ? String(m.id) : m.name || "";
        option.textContent = m.unit ? `${m.name} (${m.unit})` : m.name || "";
        taskAssignee.appendChild(option);
      });
    }

    function taskChip(status) {
      if (status === "Hoàn thành") return "chip chip--green";
      if (status === "Đang làm") return "chip chip--amber";
      return "chip chip--default";
    }
    function renderTaskItem(t, idx) {
      const li = document.createElement("li");
      li.className = "rounded-lg border border-slate-100 p-3";
      li.innerHTML = `
              <div class="flex items-center justify-between gap-2">
                <div>
                  <div class="font-medium text-slate-700">${t.title}</div>
                  <div class="text-[12px] text-slate-500">Phụ trách: ${
                    t.assignee || "-"
                  } • Hạn: ${t.due || "-"}</div>
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
      const list = $("#taskList");
      if (!list) return;
      const emptyTemplate = $("#taskEmpty");
      list.innerHTML = "";
      if (!tasks.length) {
        if (emptyTemplate) {
          const clone = emptyTemplate.cloneNode(true);
          clone.id = "taskEmptyClone";
          list.appendChild(clone);
        }
        updateKPI();
        return;
      }
      tasks.forEach((t, i) => list.appendChild(renderTaskItem(t, i)));
      updateKPI();
    }
    $("#btnAddTask").addEventListener("click", () => {
      const title = $("#taskTitle").value.trim();
      const assigneeEl = taskAssignee;
      const assigneeId = assigneeEl?.value || "";
      const assigneeName =
        assigneeEl?.options?.[assigneeEl.selectedIndex]?.textContent?.trim() ||
        "";
      const due = $("#taskDue").value;
      const status = $("#taskStatus").value;
      if (!title) return showToast("Vui lòng nhập Tên nhiệm vụ.", "error");
      if (!assigneeId)
        return showToast("Vui lòng chọn người phụ trách.", "error");
      tasks.push({ title, assignee: assigneeName, assigneeId, due, status });
      $("#taskTitle").value = "";
      if (assigneeEl) assigneeEl.value = "";
      $("#taskDue").value = "";
      $("#taskStatus").value = "Chưa bắt đầu";
      syncTasks();
      showToast("Đã thêm nhiệm vụ.");
    });
    $("#taskList").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-remove-task]");
      if (!btn) return;
      const idx = +btn.dataset.removeTask;
      tasks.splice(idx, 1);
      syncTasks();
      showToast("Đã xoá nhiệm vụ.");
    });

    // Logs
    const logs = [];
    function renderLogItem(l, idx) {
      const li = document.createElement("li");
      li.className = "rounded-lg border border-slate-100 p-3";
      li.innerHTML = `
              <div class="flex items-center justify-between">
                <span class="font-semibold text-slate-700">${
                  l.when || "—"
                } • NHẬT KÝ</span>
                <button type="button" class="text-[13px] text-rose-600 hover:underline" data-remove-log="${idx}">Xoá</button>
              </div>
              <p class="mt-1 text-[12.5px] text-slate-600">${l.content}</p>
            `;
      return li;
    }
    function syncLogs() {
      const list = $("#logList");
      if (!list) return;
      list.innerHTML = "";
      if (!logs.length) {
        const emptyTemplate = $("#logEmpty");
        if (emptyTemplate) {
          const clone = emptyTemplate.cloneNode(true);
          clone.id = "logEmptyClone";
          list.appendChild(clone);
        }
        return;
      }
      logs.forEach((l, i) => list.appendChild(renderLogItem(l, i)));
    }
    $("#btnAddLog").addEventListener("click", () => {
      const content = $("#logContent").value.trim();
      const when = $("#logWhen").value;
      if (!content)
        return showToast("Vui lòng nhập nội dung nhật ký.", "error");
      logs.push({ content, when });
      $("#logContent").value = "";
      $("#logWhen").value = "";
      syncLogs();
      showToast("Đã ghi nhật ký.");
    });
    $("#logList").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-remove-log]");
      if (!btn) return;
      const idx = +btn.dataset.removeLog;
      logs.splice(idx, 1);
      syncLogs();
      showToast("Đã xoá nhật ký.");
    });

    // Files
    const files = [];
    $("#fileInput").addEventListener("change", (e) => {
      const list = Array.from(e.target.files || []);
      list.forEach((f) => files.push({ name: f.name, size: f.size }));
      syncFiles();
      e.target.value = "";
      showToast("Đã thêm tệp đính kèm.");
    });
    function renderFileItem(f, idx) {
      const li = document.createElement("li");
      li.className =
        "rounded-lg border border-slate-100 p-3 flex items-center justify-between gap-3";
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
      const list = $("#fileList");
      if (!list) return;
      list.innerHTML = "";
      if (!files.length) {
        const emptyTemplate = $("#fileEmpty");
        if (emptyTemplate) {
          const clone = emptyTemplate.cloneNode(true);
          clone.id = "fileEmptyClone";
          list.appendChild(clone);
        }
      } else {
        files.forEach((f, i) => list.appendChild(renderFileItem(f, i)));
      }
      updateKPI();
    }
    $("#fileList").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-remove-file]");
      if (!btn) return;
      const idx = +btn.dataset.removeFile;
      files.splice(idx, 1);
      syncFiles();
      showToast("Đã xoá tệp.");
    });

    // Docs
    const docs = [];
    function renderDocItem(d, idx) {
      const li = document.createElement("li");
      li.className =
        "rounded-lg border border-slate-100 p-3 flex items-center justify-between gap-3";
      li.innerHTML = `
              <div>
                <div class="font-medium text-slate-700">${d.code || "—"} • ${
        d.type
      }</div>
                <div class="text-[12px] text-slate-500">Đã gắn vào hồ sơ</div>
              </div>
              <button class="text-[13px] text-rose-600 hover:underline" data-remove-doc="${idx}">Gỡ</button>
            `;
      return li;
    }
    function syncDocs() {
      const list = $("#docList");
      if (!list) return;
      list.innerHTML = "";
      if (!docs.length) {
        const emptyTemplate = $("#docEmpty");
        if (emptyTemplate) {
          const clone = emptyTemplate.cloneNode(true);
          clone.id = "docEmptyClone";
          list.appendChild(clone);
        }
      } else {
        docs.forEach((d, i) => list.appendChild(renderDocItem(d, i)));
      }
      updateKPI();
    }
    $("#btnAddDoc").addEventListener("click", () => {
      const code = $("#docCode").value.trim();
      const type = $("#docType").value;
      if (!code) return showToast("Vui lòng nhập Số/Ký hiệu văn bản.", "error");
      docs.push({ code, type });
      $("#docCode").value = "";
      syncDocs();
      showToast("Đã gắn văn bản.");
    });
    $("#docList").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-remove-doc]");
      if (!btn) return;
      const idx = +btn.dataset.removeDoc;
      docs.splice(idx, 1);
      syncDocs();
      showToast("Đã gỡ văn bản.");
    });

    // KPI updater
    function updateKPI() {
      const total = tasks.length;
      const done = tasks.filter((t) => t.status === "Hoàn thành").length;
      const late = tasks.filter((t) => {
        if (!t.due || t.status === "Hoàn thành") return false;
        const d = new Date(t.due);
        const today = new Date();
        // so sánh theo ngày (bỏ giờ)
        d.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        return d < today;
      }).length;

      $("#kpiDone").textContent = `${done} / ${total}`;
      $("#kpiLate").textContent = late;
      $("#kpiDocs").textContent = docs.length;
      $("#kpiFiles").textContent = files.length;
    }

    // Toast
    function showToast(msg, type = "success") {
      const toast = $("#toast");
      if (!toast) {
        alert(msg);
        return;
      }
      toast.textContent = msg;
      toast.classList.remove("toast--error", "toast--show");
      if (type === "error") toast.classList.add("toast--error");
      setTimeout(() => toast.classList.add("toast--show"), 10);
      setTimeout(() => toast.classList.remove("toast--show"), 2400);
    }

    // Validate + submit
    function validateForm() {
      const title = $("#caseTitle").value.trim();
      const dept = $("#caseDept").value.trim();
      const due = $("#caseDue").value;
      const leader = $("#caseLeader").value.trim();
      if (!title) return { ok: false, msg: "Vui lòng nhập Tiêu đề hồ sơ." };
      if (!dept) return { ok: false, msg: "Vui lòng chọn Phòng phụ trách." };
      if (!due) return { ok: false, msg: "Vui lòng chọn Hạn hoàn thành." };
      if (!leader) return { ok: false, msg: "Vui lòng nhập Người chủ trì." };
      return { ok: true };
    }

    function mapTaskStatus(label) {
      const normalized = (label || "").toLowerCase();
      if (normalized.includes("hoàn")) return "DONE";
      if (normalized.includes("đang")) return "IN_PROGRESS";
      return "OPEN";
    }

    function buildCasePayload() {
      const deptSelect = $("#caseDept");
      const deptOption = deptSelect?.options?.[deptSelect.selectedIndex];
      const departmentId = deptOption?.dataset?.departmentId || "";
      const leaderMember = members.find((m) => m.role === "Chủ trì");
      const participants = members
        .filter((m) => m.role !== "Chủ trì")
        .map((m) => ({
          user_id: m.id,
          role_on_case:
            m.role === "Người được giao"
              ? "assignee"
              : m.role === "Theo dõi"
              ? "watcher"
              : "coowner",
        }));
      const tasksPayload = tasks.map((t) => ({
        title: t.title,
        assignee_id: t.assigneeId,
        status: mapTaskStatus(t.status),
        due_date: t.due || null,
      }));

      return {
        title: $("#caseTitle").value.trim(),
        case_code: $("#caseCode").value.trim() || undefined,
        description: $("#caseDesc").value.trim() || undefined,
        case_type: $("#caseType")?.value || undefined,
        priority: $("#casePriority")?.value || undefined,
        department_id: departmentId || undefined,
        due_date: $("#caseDue")?.value || undefined,
        leader_id: leaderMember?.id || undefined,
        participants,
        tasks: tasksPayload,
      };
    }

    async function submitCase({ draft = false } = {}) {
      const v = validateForm();
      if (!v.ok) {
        showToast(v.msg, "error");
        return;
      }
      if (!api?.cases?.create) {
        showToast("ApiClient chưa sẵn sàng. Vui lòng tải lại trang.", "error");
        return;
      }
      const btnCreate = $("#btnCreateAssign");
      const btnDraft = $("#btnSaveDraft");
      [btnCreate, btnDraft].forEach((b) => {
        if (b) b.disabled = true;
      });
      if (btnCreate) btnCreate.textContent = "Đang gửi...";
      if (btnDraft) btnDraft.textContent = "Đang lưu...";

      const payload = buildCasePayload();
      payload.is_draft = Boolean(draft);

      try {
        const res = await api.cases.create(payload);
        const caseId = res.case_id || res.id || res.case_id;
        if (draft) {
          showToast("Đã lưu nháp hồ sơ.", "success");
          // Có thể lưu caseId vào localStorage để tiếp tục chỉnh sửa sau
          if (caseId && typeof Storage !== "undefined") {
            try {
              localStorage.setItem("lastDraftCaseId", String(caseId));
            } catch (e) {
              // Ignore localStorage errors
            }
          }
        } else {
          showToast("Tạo hồ sơ thành công.", "success");
          if (caseId) {
            setTimeout(() => {
              window.location.href = `/lanhdao/hosocongviec/${caseId}/`;
            }, 600);
          }
        }
      } catch (err) {
        console.error("[lanhdao] Lỗi khi tạo hồ sơ:", err);
        const msg =
          err?.data?.detail || 
          err?.response?.data?.detail ||
          err?.message || 
          "Không thể gửi hồ sơ. Vui lòng thử lại.";
        showToast(msg, "error");
      } finally {
        [btnCreate, btnDraft].forEach((b) => {
          if (b) {
            b.disabled = false;
            b.textContent =
              b.id === "btnCreateAssign" ? "Tạo & giao việc" : "Lưu nháp";
          }
        });
      }
    }

    const formEl = $("#createCaseForm");
    if (formEl) {
      formEl.addEventListener("submit", (e) => {
        e.preventDefault();
        submitCase({ draft: false });
      });
    }

    const btnDraft = $("#btnSaveDraft");
    if (btnDraft) {
      btnDraft.addEventListener("click", (e) => {
        e.preventDefault();
        submitCase({ draft: true });
      });
    }

    // Đồng bộ KPI ban đầu
    syncMembers();
    syncTasks();
    syncLogs();
    syncFiles();
    if (!tbody) return;

    const searchInput = document.querySelector('[data-filter="q"]');
    const statusSel = document.querySelector('[data-filter="status"]');
    const prioritySel = document.querySelector('[data-filter="priority"]');
    const rowCounter = document.querySelector("[data-count='rows']");

    const state = {
      keyword: "",
      status: "",
      priority: "",
    };

    let allCases = [];

    // Initial load
    loadCases();

    // Event listeners
    if (searchInput) {
      searchInput.addEventListener("input", debounce((e) => {
        state.keyword = e.target.value.trim().toLowerCase();
        applyFilters();
      }, 300));
    }

    if (statusSel) {
      statusSel.addEventListener("change", (e) => {
        state.status = e.target.value;
        applyFilters();
      });
    }

    if (prioritySel) {
      prioritySel.addEventListener("change", (e) => {
        state.priority = e.target.value;
        applyFilters();
      });
    }

    function loadCases() {
      renderLoading();
      api.cases.list({ ordering: "-created_at", page_size: 50 })
        .then((data) => {
          const items = api.extractItems(data);
          allCases = Array.isArray(items) ? items : [];
          applyFilters();
        })
        .catch((err) => {
          console.error("[lanhdao] Lỗi tải hồ sơ:", err);
          renderError("Không thể tải danh sách hồ sơ.");
        });
    }

    function applyFilters() {
      if (!allCases.length) {
        renderEmpty();
        updateCount(0);
        return;
      }

      const filtered = allCases.filter(item => {
        // Keyword filter
        if (state.keyword) {
          const text = [
            item.title,
            item.code,
            item.leader?.full_name,
            item.department?.name
          ].filter(Boolean).join(" ").toLowerCase();
          if (!text.includes(state.keyword)) return false;
        }

        // Status filter
        if (state.status) {
          const statusName = item.status?.case_status_name || item.status_name || "";
          if (statusName !== state.status) return false;
        }

        // Priority filter
        if (state.priority) {
          const priority = item.priority || "";
          if (priority !== state.priority) return false;
        }

        return true;
      });

      renderRows(filtered);
      updateCount(filtered.length);
    }

    function renderRows(list) {
      tbody.innerHTML = "";
      if (!list.length) {
        renderEmpty();
        return;
      }

      const fragment = document.createDocumentFragment();
      list.forEach(item => {
        fragment.appendChild(createRow(item));
      });
      tbody.appendChild(fragment);
    }

    function createRow(item) {
      const tr = document.createElement("tr");
      tr.className = "border-b border-slate-100 bg-white hover:bg-slate-50";
      
      const id = item.id;
      const title = item.title || "Hồ sơ không tên";
      const code = item.code || `HS-${id}`;
      const leader = item.leader?.full_name || item.leader?.username || "—";
      const created = helpers.formatDate(item.created_at);
      const deadline = helpers.formatDate(item.deadline);
      const priority = item.priority || "Thường";
      const status = item.status?.case_status_name || item.status_name || "Mới tạo";
      
      // Progress calculation (simplified)
      const progress = item.progress_percent || 0;

      // Link to detail page - CRITICAL FIX
      const detailUrl = `/lanhdao/hosocongviec/${id}/`;

      tr.innerHTML = `
        <td class="py-3 pr-3 align-top">
          <div class="font-medium break-words">
            <a href="${detailUrl}" class="text-blue-700 hover:underline flex flex-wrap items-center gap-2">
              <span class="badge-dot bg-blue-600"></span>
              ${helpers.escapeHtml(title)}
            </a>
          </div>
          <div class="text-xs text-slate-500 mt-1">Mã: ${helpers.escapeHtml(code)}</div>
        </td>
        <td class="py-3 pr-3 whitespace-nowrap align-top">${helpers.escapeHtml(leader)}</td>
        <td class="py-3 pr-3 whitespace-nowrap align-top">${created}</td>
        <td class="py-3 pr-3 whitespace-nowrap text-rose-600 font-medium align-top">${deadline}</td>
        <td class="py-3 pr-3 align-top">
          <div class="w-28 h-2 rounded-full bg-slate-200">
            <div class="h-full bg-slate-700 rounded-full" style="width: ${progress}%"></div>
          </div>
          <div class="text-xs text-slate-500 mt-1">${progress}%</div>
        </td>
        <td class="py-3 pr-3 whitespace-nowrap align-top">
          <span class="chip ${getPriorityClass(priority)}">${helpers.escapeHtml(priority)}</span>
        </td>
        <td class="py-3 pr-3 whitespace-nowrap align-top">
          <span class="chip ${getStatusClass(status)}">${helpers.escapeHtml(status)}</span>
        </td>
        <td class="py-3 pr-0 text-right align-top">
          <div class="flex items-center justify-end gap-2">
            <a href="${detailUrl}" class="btn-icon" title="Xem chi tiết">
              👁
            </a>
          </div>
        </td>
      `;
      return tr;
    }

    function renderLoading() {
      tbody.innerHTML = '<tr><td colspan="8" class="py-8 text-center text-slate-500">Đang tải dữ liệu...</td></tr>';
    }

    function renderEmpty() {
      tbody.innerHTML = '<tr><td colspan="8" class="py-8 text-center text-slate-500">Không tìm thấy hồ sơ nào.</td></tr>';
    }

    function renderError(msg) {
      tbody.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-rose-600">${msg}</td></tr>`;
    }

    function updateCount(count) {
      if (rowCounter) rowCounter.textContent = `Hiển thị ${count} công việc`;
    }

    function debounce(fn, delay) {
      let timeout;
      return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
      };
    }

    function getPriorityClass(p) {
      if (p === "Cao" || p === "Khẩn") return "chip--rose";
      if (p === "Trung bình") return "chip--amber";
      return "chip--default";
    }

    function getStatusClass(s) {
      if (s === "Hoàn thành" || s === "Đã đóng") return "chip--green";
      if (s === "Trễ hạn") return "chip--rose";
      if (s === "Đang thực hiện") return "chip--blue";
      return "chip--default";
    }
  };

  pageHandlers["vanbandi"] = function () {
        // Check if modern implementation exists (lanhdao-vanbandi.js)
        if (window.LDOutgoingListOverride) {
          console.log('[lanhdao] Skipping legacy vanbandi handler - using lanhdao-vanbandi.js');
          return;
        }
        
        const api = window.ApiClient;
        const helpers = window.DocHelpers;
        const tableBody = document.getElementById("docTableBody");
        if (!tableBody) return;

        const searchTitle = document.getElementById("searchTitle");
        const searchGlobal = document.getElementById("globalSearch");
        const statusBtn = document.getElementById("btnStatusFilter");
        const statusMenu = document.getElementById("statusMenu");
        const statusLabel = document.getElementById("statusLabel");
        const levelBtn = document.getElementById("btnLevelFilter");
        const levelMenu = document.getElementById("levelMenu");
        const levelLabel = document.getElementById("levelLabel");

        const kpiEls = {
          approve: document.getElementById("kpiPendingApprove"),
          sign: document.getElementById("kpiPendingSign"),
          process: document.getElementById("kpiProcessing"),
          issued: document.getElementById("kpiIssued"),
        };

        const state = {
          keyword: "",
          globalKeyword: "",
          status: "all",
          level: "all",
        };

        let normalizedDocs = [];

        const debouncedFilter = debounce(applyFilters, 180);

        setupDropdown(statusBtn, statusMenu, statusLabel, "status");
        setupDropdown(levelBtn, levelMenu, levelLabel, "level");
        registerSearch(searchTitle, "keyword");
        registerSearch(searchGlobal, "globalKeyword");

        if (!api || !helpers) {
          return;
        }

        runAfterDom(() => loadDocuments());

        function loadDocuments() {
          const docApi = api.documents;
          if (!docApi) {
            renderError("Chua cau hinh Document API.");
            return Promise.resolve();
          }
          renderLoading();
          return docApi
            .list({
              direction: "OUTBOUND",
              ordering: "-updated_at",
              page_size: 50,
            })
            .then((data) => {
              const payload = api.extractItems(data) || [];
              normalizedDocs = payload.map((item) =>
                helpers.normalizeOutboundDoc(item)
              );
              renderRows(normalizedDocs);
              applyFilters();
            })
            .catch((error) => {
              console.error("[lanhdao] Loi tai van ban di:", error);
              renderError(helpers.resolveErrorMessage(error));
            });
        }

        function renderRows(list) {
          tableBody.innerHTML = "";
          if (!list.length) {
            renderEmpty();
            return;
          }
          const fragment = document.createDocumentFragment();
          list.forEach((doc) => fragment.appendChild(createRow(doc)));
          tableBody.appendChild(fragment);
        }

        function createRow(doc) {
          const tr = document.createElement("tr");
          const levelValue = mapLevelFromUrgency(doc.urgencyKey);
          const statusValue = mapStatusForDataset(doc.statusKey);
          tr.dataset.row = "1";
          tr.dataset.status = statusValue;
          tr.dataset.level = levelValue;
          tr.dataset.docId = doc.id != null ? String(doc.id) : "";
          tr.dataset.docTitle = doc.title || "";
          tr.dataset.docNumber = doc.number || "";
          tr.dataset.docSigner = doc.signer || "";
          tr.dataset.docReceiver = doc.recipients || "";
          tr.dataset.docIssuedDate = doc.issuedDate || "";
          tr.dataset.docDispatchAt = doc.publishedDate || "";
          tr.dataset.docUrgency = doc.urgencyLabel || "";
          tr.dataset.docStatus = doc.statusLabel || "";
          tr.__docData = doc;

          const docId =
            doc.id ||
            doc.document_id ||
            doc.documentId ||
            doc.raw?.id ||
            doc.raw?.document_id ||
            doc.raw?.documentId ||
            "";
          const detailHref = docId
            ? `/lanhdao/vanbandi/${encodeURIComponent(docId)}/`
            : `vanbandi-detail.html?id=${encodeURIComponent(docId)}`;

          const urgencyClass = urgencyBadgeClass(doc.urgencyKey);
          const statusClass = outboundStatusClass(doc.statusKey);

          const publishedInfo = doc.publishedDate
            ? `        <div class="text-[12px] text-slate-500">Phát hành: ${helpers.escapeHtml(
                helpers.formatDate(doc.publishedDate)
              )}</div>`
            : "";

          tr.innerHTML = [
            '<td class="py-2 pr-3">',
            `  <a href="${detailHref}" class="text-blue-700 hover:underline inline-flex items-center gap-2" data-open-detail="1">`,
            '    <span class="badge-dot bg-blue-600"></span>',
            `    ${helpers.escapeHtml(doc.title || "Văn bản")}`,
            "  </a>",
            "</td>",
            `<td class="py-2 px-3">${helpers.escapeHtml(
              doc.number || "—"
            )}</td>`,
            '<td class="py-2 px-3">',
            doc.issuedDate
              ? `  <div>Ngày ký: ${helpers.escapeHtml(
                  helpers.formatDate(doc.issuedDate)
                )}</div>`
              : "",
            publishedInfo,
            "</td>",
            `<td class="py-2 px-3">${helpers.escapeHtml(
              doc.recipients || "—"
            )}</td>`,
            `<td class="py-2 px-3"><span class="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ${urgencyClass}">${helpers.escapeHtml(
              doc.urgencyLabel || ""
            )}</span></td>`,
            `<td class="py-2 px-3"><span class="px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass}">${helpers.escapeHtml(
              doc.statusLabel
            )}</span></td>`,
            '<td class="py-2 pl-3 pr-0">',
            '  <div class="flex items-center justify-end gap-2">',
            '    <button class="btn-icon" title="Xem" data-open-detail="1" type="button">',
            '      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
            '        <circle cx="11" cy="11" r="7"></circle>',
            '        <line x1="16.65" y1="16.65" x2="21" y2="21"></line>',
            "      </svg>",
            "    </button>",
            '    <button class="btn-icon" title="Nhật ký" data-action="log" type="button">',
            '      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
            '        <path d="M4 4h16v16H4z"></path>',
            '        <path d="M8 4v4h8V4"></path>',
            "      </svg>",
            "    </button>",
            '    <button class="btn-icon" title="Tải xuống" data-action="dl" type="button">',
            '      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
            '        <path d="M12 5v14"></path>',
            '        <path d="m19 12-7 7-7-7"></path>',
            "      </svg>",
            "    </button>",
            "  </div>",
            "</td>",
          ]
            .filter(Boolean)
            .join("\n");

          return tr;
        }

        function applyFilters() {
          if (!normalizedDocs.length) {
            updateKPIs([]);
            tableBody.querySelectorAll("[data-row]").forEach((row) => {
              row.style.display = "none";
            });
            return;
          }

          const keyword = helpers.normalizeText(activeKeyword());
          const statusTargets = mapStatusTargets(state.status);
          const levelFilter = state.level;

          const filteredDocs = normalizedDocs.filter((doc) =>
            matchesDoc(doc, statusTargets, levelFilter, keyword)
          );
          updateKPIs(filteredDocs);

          tableBody.querySelectorAll("[data-row]").forEach((row) => {
            const doc = row.__docData;
            const show = doc
              ? matchesDoc(doc, statusTargets, levelFilter, keyword)
              : false;
            row.style.display = show ? "" : "none";
          });
        }

        function matchesDoc(doc, statusTargets, levelFilter, keyword) {
          if (
            statusTargets &&
            statusTargets.length &&
            !statusTargets.includes(doc.statusKey)
          ) {
            return false;
          }
          if (levelFilter !== "all") {
            const levelValue = mapLevelFromUrgency(doc.urgencyKey);
            if (!levelMatches(levelValue, levelFilter)) {
              return false;
            }
          }
          if (keyword && doc.searchText && !doc.searchText.includes(keyword)) {
            return false;
          }
          return true;
        }

        function updateKPIs(docs) {
          const counts = Array.isArray(docs)
            ? helpers.computeOutboundKPIs(docs)
            : docs;
          if (kpiEls.approve)
            kpiEls.approve.textContent = String(counts.draft || 0);
          if (kpiEls.sign)
            kpiEls.sign.textContent = String(counts["pending-sign"] || 0);
          if (kpiEls.process)
            kpiEls.process.textContent = String(counts.approved || 0);
          if (kpiEls.issued)
            kpiEls.issued.textContent = String(counts.published || 0);
        }

        function registerSearch(input, key) {
          if (!input) return;
          input.addEventListener("input", (event) => {
            state[key] = event.target.value || "";
            debouncedFilter();
          });
        }

        function setupDropdown(button, menu, label, key) {
          if (!button || !menu || !label) return;
          button.dataset[key] = "all";
          button.addEventListener("click", (event) => {
            event.stopPropagation();
            const isOpen = !menu.classList.contains("hidden");
            menu.classList.toggle("hidden", isOpen);
            button.setAttribute("aria-expanded", isOpen ? "false" : "true");
          });
          menu.addEventListener("click", (event) => {
            const item = event.target.closest(".filter-item");
            if (!item) return;
            const value = item.getAttribute(`data-${key}`) || "all";
            label.textContent = item.textContent.trim();
            button.dataset[key] = value;
            menu.classList.add("hidden");
            button.setAttribute("aria-expanded", "false");
            state[key] = value;
            applyFilters();
          });
          document.addEventListener("click", (event) => {
            if (
              !menu.classList.contains("hidden") &&
              !menu.contains(event.target) &&
              event.target !== button
            ) {
              menu.classList.add("hidden");
              button.setAttribute("aria-expanded", "false");
            }
          });
        }

        function mapStatusTargets(value) {
          switch (value) {
            case "cho_duyet":
              return ["draft"];
            case "cho_ky":
              return ["pending-sign"];
            case "dang_xu_ly":
              return ["approved"];
            case "da_phat_hanh":
              return ["published"];
            case "tra_lai":
              return ["draft"];
            default:
              return value === "all" ? null : [value];
          }
        }

        function mapStatusForDataset(status) {
          switch (status) {
            case "published":
              return "da_phat_hanh";
            case "pending-sign":
              return "cho_ky";
            case "approved":
              return "dang_xu_ly";
            case "draft":
            default:
              return "cho_duyet";
          }
        }

        function mapLevelFromUrgency(urgencyKey) {
          switch (urgencyKey) {
            case "ratkhan":
            case "khan":
              return "urgent";
            case "cao":
              return "high";
            default:
              return "normal";
          }
        }

        function levelMatches(levelValue, filter) {
          if (filter === "urgent") return levelValue === "urgent";
          if (filter === "high") return levelValue === "high";
          if (filter === "normal") return levelValue === "normal";
          return true;
        }

        function outboundStatusClass(key) {
          switch (key) {
            case "published":
              return "bg-emerald-50 text-emerald-700";
            case "approved":
              return "bg-blue-100 text-blue-700";
            case "pending-sign":
              return "bg-amber-100 text-amber-700";
            default:
              return "bg-slate-100 text-slate-700";
          }
        }

        function urgencyBadgeClass(key) {
          switch (key) {
            case "ratkhan":
              return "bg-rose-100 text-rose-700";
            case "khan":
              return "bg-amber-100 text-amber-700";
            case "cao":
              return "bg-orange-100 text-orange-700";
            default:
              return "bg-slate-100 text-slate-700";
          }
        }

        function activeKeyword() {
          const local = (state.keyword || "").trim();
          if (local) return local;
          return (state.globalKeyword || "").trim();
        }

        function renderLoading() {
          tableBody.innerHTML =
            '<tr><td colspan="7" class="py-6 text-center text-[13px] text-slate-500">Đang tải dữ liệu...</td></tr>';
        }



        function renderEmpty() {
          tableBody.innerHTML =
            '<tr><td colspan="7" class="py-6 text-center text-[13px] text-slate-500">Không có văn bản phù hợp với bộ lọc.</td></tr>';
          updateKPIs([]);
        }

        function renderError(message) {
          tableBody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-[13px] text-rose-600">${helpers.escapeHtml(
            message
          )}</td></tr>`;
          updateKPIs([]);
        }

        function debounce(fn, delay = 160) {
          let timer;
          return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(null, args), delay);
          };
        }
      };


  pageHandlers["vanbandi-detail"] = () => initDocumentDetailPage();
  pageHandlers["vanbanden-detail"] = () => initDocumentDetailPage();

  function initDocumentDetailPage() {
    if (window.LDDetailOverride) {
      return;
    }
    const docId = getQueryParam("id");
    if (!docId) return;

    const api = window.ApiClient;
    const docApi = api?.documents;
    if (!docApi) {
      console.warn("[lanhdao] ApiClient.documents is not ready.");
      return;
    }

    const buttons = document.querySelectorAll("[data-doc-action]");
    const pageId = (document.body?.dataset?.page || "").toLowerCase();
    if (pageId === "vanbanden-detail") {
      buttons.forEach((button) => {
        button.disabled = true;
        button.classList.add("opacity-60", "cursor-not-allowed");
        button.title = "Vui lòng thao tác qua bảng Luồng trạng thái.";
      });
      initLeaderInboundWorkflow(docId, api);
      return;
    }
    if (!buttons.length) return;

    const role = (document.body?.dataset?.role || "").toLowerCase();
    const actionMap = {
      approve: {
        method: docApi.approve,
        success: "Đã phê duyệt văn bản.",
        allowedRoles: ["lanhdao"],
      },
      reject: {
        method: docApi.reject,
        success: "Đã từ chối văn bản.",
        allowedRoles: ["lanhdao"],
        payload: () => ({
          comment: "Từ chối từ giao diện lãnh đạo.",
        }),
      },
      sign: {
        method: docApi.sign,
        success: "Đã ký số văn bản.",
        allowedRoles: ["lanhdao"],
      },
    };
    const noPermissionMessage = "Bạn không có quyền thực hiện thao tác này.";

    buttons.forEach((button) => {
      const action = button.dataset.docAction;
      const config = actionMap[action];
      if (!config) return;
      if (
        Array.isArray(config.allowedRoles) &&
        !config.allowedRoles.includes(role)
      ) {
        button.disabled = true;
        button.title = noPermissionMessage;
        button.classList.add("cursor-not-allowed", "opacity-70");
        return;
      }
      button.addEventListener("click", async () => {
        if (button.disabled) return;
        button.disabled = true;
        try {
          const payload =
            typeof config.payload === "function"
              ? config.payload()
              : config.payload;
          await config.method(docId, payload);
        } catch (error) {
          showDetailToast(resolveDetailError(error), "error");
          button.disabled = false;
        }
      });
    });
  }

  function initLeaderInboundWorkflow(docId, api) {
    const helpers = window.DocHelpers || {};
    const workflowLib = window.DocWorkflow || null;
    if (
      !docId ||
      !api ||
      !workflowLib ||
      typeof workflowLib.mount !== "function"
    ) {
      return;
    }
    const docApi = api.documents;
    if (!docApi) {
      return;
    }
    const workflowContainer = document.getElementById("doc-workflow-panel");
    if (!workflowContainer) {
      return;
    }
    const inboundApi =
      typeof workflowLib.ensureInboundDocsClient === "function"
        ? workflowLib.ensureInboundDocsClient(api)
        : null;
    if (!inboundApi) {
      console.warn(
        "[lanhdao] Không tìm thấy client văn bản đến để thao tác trạng thái."
      );
      return;
    }
    const roleName = document.body?.dataset?.role || "lanhdao";
    const currentUser =
      typeof api.getCurrentUser === "function" ? api.getCurrentUser() : null;
    const currentUserId =
      currentUser?.id || currentUser?.user_id || currentUser?.userId || null;
    let workflowInstance = null;
    let assignmentsCache = [];

    function buildPrefill(doc, normalized) {
      return {
        received_number:
          doc?.received_number || normalized?.incomingNumber || "",
        received_date: normalized?.receivedDate || doc?.received_date || "",
        sender: doc?.sender || normalized?.sender || "",
      };
    }

    function isCurrentAssignee(list) {
      if (!currentUserId) return false;
      const source = Array.isArray(list) ? list : assignmentsCache;
      return source.some((item) => {
        const userId = item?.user_id || item?.user?.user_id || item?.user?.id;
        return userId && String(userId) === String(currentUserId);
      });
    }

    function updateWorkflow(doc, normalized, assignments) {
      const payload = {
        stateKey: normalized.statusKey,
        prefill: buildPrefill(doc, normalized),
        isAssignee: isCurrentAssignee(assignments),
      };
      if (!workflowInstance) {
        workflowInstance = workflowLib.mount({
          container: workflowContainer,
          docId,
          role: roleName,
          api: inboundApi,
          stateKey: payload.stateKey,
          prefill: payload.prefill,
          isAssignee: payload.isAssignee,
          onStateChange: () => refreshDetail(),
        });
      } else {
        workflowInstance.update(payload);
      }
    }

    function refreshDetail() {
      return docApi
        .retrieve(docId)
        .then((doc) => {
          const normalized = helpers.normalizeInboundDoc
            ? helpers.normalizeInboundDoc(doc)
            : {
                statusKey: doc?.status?.code || "tiep-nhan",
                incomingNumber: doc?.incoming_number,
                receivedDate: doc?.received_date,
                sender: doc?.sender,
              };
          assignmentsCache = Array.isArray(doc?.assignees) ? doc.assignees : [];
          updateWorkflow(doc, normalized, assignmentsCache);
        })
        .catch((error) => {
          console.error("[lanhdao] Lỗi tải văn bản đến:", error);
        });
    }

    refreshDetail();
  }

  function getQueryParam(name) {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get(name);
    } catch (error) {
      return null;
    }
  }

  function buildPublishPayload() {
    return {
      prefix: "UBND",
      postfix: "/VP",
      year: new Date().getFullYear(),
    };
  }

  function resolveDetailError(error) {
    const helpers = window.DocHelpers;
    if (helpers?.resolveErrorMessage) {
      return helpers.resolveErrorMessage(error);
    }
    if (!error) {
      return "Unable to perform the operation.";
    }
    if (error.data) {
      if (typeof error.data === "string") return error.data;
      if (error.data.detail) return String(error.data.detail);
    }
    if (error.message) return String(error.message);
    return "Unable to perform the operation.";
  }

  pageHandlers["thongbaonhacviec"] = function () {
    const list = document.getElementById("notifList");
    if (!list) return;

    const searchInput = document.getElementById("q");
    const typeSelect = document.getElementById("type");
    const statusSelect = document.getElementById("status");
    const counter = document.getElementById("count");
    const emptyState = document.getElementById("emptyState");

    const state = { items: [] };

    const escapeHtmlLocal = (value) => {
      const helper = window.Layout?.helpers?.escapeHtml;
      if (typeof helper === "function") return helper(value);
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
    };

    const channelLabel = (value) => {
      const map = { app: "Ứng dụng", email: "Email", sms: "SMS", push: "Push" };
      return map[value?.toLowerCase?.() || ""] || "Thông báo";
    };

    const reminderStatus = (status) => {
      const map = {
        PENDING: { label: "Đang chờ", cls: "bg-amber-50 text-amber-700" },
        SENT: { label: "Đã gửi", cls: "bg-emerald-50 text-emerald-700" },
        CLEARED: { label: "Đã kết thúc", cls: "bg-slate-100 text-slate-700" },
      };
      return map[status?.toUpperCase?.() || ""] || { label: "Trạng thái", cls: "bg-slate-100 text-slate-700" };
    };

    const renderItem = (item) => {
      if (item.kind === "reminder") {
        const stat = reminderStatus(item.status);
        const due = window.NotificationApi?.formatDateTime(item.dueAt) || "";
        return `
          <li class="card p-0 overflow-hidden notif-item" data-kind="reminder" data-id="${escapeHtmlLocal(item.id)}">
            <div class="flex items-start gap-3 px-4 py-3 bg-amber-50/60 border-l-4 border-amber-200">
              <div class="text-amber-600 mt-0.5">⏰</div>
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-3">
                  <h4 class="font-semibold truncate">${escapeHtmlLocal(item.title || "Nhắc việc")}</h4>
                  <span class="chip chip--default shrink-0">Nhắc việc</span>
                </div>
                <p class="text-sm text-slate-600">${escapeHtmlLocal(item.body || "")}</p>
                <div class="text-xs text-slate-400 mt-1">
                  Hạn: ${escapeHtmlLocal(due || "Chưa có")} • ${escapeHtmlLocal(item.entityType || "")}${item.entityId ? ` #${escapeHtmlLocal(item.entityId)}` : ""}
                </div>
              </div>
              <span class="rounded-full px-2 py-0.5 text-[12px] ${stat.cls}">${escapeHtmlLocal(stat.label)}</span>
            </div>
          </li>
        `;
      }
      const sentAt = window.NotificationApi?.formatDateTime(item.sentAt) || "";
      const unreadClass = item.readAt ? "" : "bg-blue-50/70 border-l-4 border-blue-200";
      const statusText = item.readAt ? "Đã đọc" : "Chưa đọc";
      return `
        <li class="card p-0 overflow-hidden notif-item ${item.readAt ? "" : "is-unread"}" data-kind="notification" data-id="${escapeHtmlLocal(item.id)}">
          <div class="flex items-start gap-3 px-4 py-3 ${unreadClass}">
            <div class="text-blue-600 mt-0.5">🔔</div>
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-3">
                <h4 class="font-semibold truncate">${escapeHtmlLocal(item.title || "Thông báo")}</h4>
                <span class="chip chip--default shrink-0">${escapeHtmlLocal(channelLabel(item.channel))}</span>
              </div>
              <p class="text-sm text-slate-600">${escapeHtmlLocal(item.body || "")}</p>
              <div class="text-xs text-slate-400 mt-1">
                ${sentAt ? `Gửi: ${escapeHtmlLocal(sentAt)}` : ""}
              </div>
            </div>
            <div class="shrink-0 flex items-center gap-2">
              <span class="chip chip--default ${item.readAt ? "" : "bg-blue-100 text-blue-700"}">${escapeHtmlLocal(statusText)}</span>
              <button class="btn-icon" data-action="mark" data-tooltip="Đánh dấu đã đọc" title="Đánh dấu đã đọc">✔</button>
            </div>
          </div>
        </li>
      `;
    };

    const applyFilters = () => {
      const keyword = (searchInput?.value || "").toLowerCase().trim();
      const typeValue = typeSelect?.value || "";
      const statusValue = statusSelect?.value || "";

      return state.items.filter((item) => {
        const text = `${item.title || ""} ${item.body || ""}`.toLowerCase();
        const matchKeyword = !keyword || text.includes(keyword);
        const matchType = !typeValue || item.kind === typeValue;
        let matchStatus = true;
        if (statusValue === "unread") {
          matchStatus = item.kind === "notification" && !item.readAt;
        } else if (statusValue === "read") {
          matchStatus = item.kind === "notification" && !!item.readAt;
        } else if (statusValue) {
          matchStatus =
            item.kind === "reminder" &&
            (item.status || "").toUpperCase() === statusValue.toUpperCase();
        }
        return matchKeyword && matchType && matchStatus;
      });
    };

    const refresh = () => {
      const filtered = applyFilters();
      list.innerHTML = filtered.map(renderItem).join("");
      if (counter) counter.textContent = String(filtered.length);
      if (emptyState) emptyState.classList.toggle("hidden", filtered.length > 0);
    };

    list.addEventListener("click", async (event) => {
      const btn = event.target.closest("button[data-action='mark']");
      if (!btn) return;
      const li = event.target.closest("li[data-id]");
      if (!li) return;
      const id = li.dataset.id;
      const item = state.items.find((it) => String(it.id) === String(id));
      if (!item || item.kind !== "notification") return;
      try {
        const api = window.NotificationApi;
        if (!api) return;
        await api.markNotificationRead(id);
        item.readAt = new Date().toISOString();
        refresh();
        showToast("Đã đánh dấu đã đọc.");
      } catch (err) {
        console.error("[lanhdao] mark read failed", err);
        showToast("Không thể đánh dấu đã đọc", "error");
      }
    });

    const loadData = async () => {
      try {
        const api = window.NotificationApi;
        if (!api) {
          showToast("NotificationApi chưa sẵn sàng", "error");
          return;
        }
        const [notiRaw, remindRaw] = await Promise.all([
          api.fetchNotifications().catch(() => []),
          api.fetchReminders().catch(() => []),
        ]);
        const notifications = (notiRaw || []).map((n) => ({
          kind: "notification",
          ...api.normalizeNotification(n),
        }));
        const reminders = (remindRaw || []).map((r) => ({
          kind: "reminder",
          ...api.normalizeReminder(r),
        }));
        state.items = [...notifications, ...reminders];
        refresh();
      } catch (err) {
        console.error("[lanhdao] load notifications failed", err);
        showToast("Không thể tải thông báo & nhắc việc", "error");
      }
    };

    searchInput?.addEventListener("input", refresh);
    typeSelect?.addEventListener("change", refresh);
    statusSelect?.addEventListener("change", refresh);

    loadData();
  };


  pageHandlers["taikhoan"] = function () {
    const qs = (s, r = document) => r.querySelector(s);
    const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

    function toast(msg, type = "info") {
      const t = qs("#toast");
      if (!t) return alert(msg);
      t.textContent = msg;
      t.classList.remove(
        "toast--show",
        "toast--success",
        "toast--error",
        "toast--warn"
      );
      t.classList.add("toast--show");
      if (type === "success") t.classList.add("toast--success");
      else if (type === "error") t.classList.add("toast--error");
      else if (type === "warn") t.classList.add("toast--warn");
      setTimeout(() => t.classList.remove("toast--show"), 2000);
    }

    qsa("#btn-sidebar").forEach((btn) => {
      btn.addEventListener("click", () => {
        qs("#sidebar")?.classList.toggle("hidden");
      });
    });

    const btnEdit = qs("#btnEdit");
    const btnSave = qs("#btnSave");
    const btnCancel = qs("#btnCancel");

    const inputs = ["#inpName", "#inpEmail", "#inpPhone", "#inpDept"].map(
      (id) => qs(id)
    );
    const displayName = qs("#displayName");
    const displayRole = qs("#displayRole");
    const displayUsername = qs("#displayUsername");
    const displaySince = qs("#displaySince");
    const avatarEl = qs("[data-avatar-initials]");
    const layout = window.Layout || null;
    const getApiClient = () => window.ApiClient || null;

    let snapshot = {};

    const textInputs = {
      name: qs("#inpName"),
      email: qs("#inpEmail"),
      phone: qs("#inpPhone"),
      department: qs("#inpDept"),
    };

    function deriveInitials(value) {
      const raw = (value || "").trim();
      if (!raw) return "--";
      const parts = raw.split(/\s+/).filter(Boolean);
      if (!parts.length) return raw.slice(0, 2).toUpperCase();
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      const first = parts[0][0] || "";
      const last = parts[parts.length - 1][0] || "";
      return (first + last).toUpperCase();
    }

    function applyUserProfile(user) {
      if (!user) return;
      const fullName = (user.full_name || user.name || "").trim();
      const username = (user.username || "").trim();
      const email = (user.email || "").trim();
      const phone = (user.phone || "").trim();
      const department = (user.department_name || user.department || "").trim();
      const roleLabel = user.role_name || user.role || displayRole?.textContent;
      const createdAt = user.created_at;

      if (displayName) {
        displayName.textContent =
          fullName || username || displayName.textContent;
      }
      if (displayRole && roleLabel) {
        displayRole.textContent = roleLabel;
      }
      if (displayUsername) {
        displayUsername.textContent = username
          ? `@${username}`
          : displayUsername.textContent;
      }
      if (displaySince && createdAt) {
        const date = new Date(createdAt);
        if (!Number.isNaN(date.getTime())) {
          displaySince.textContent = `Tài khoản tạo ngày ${date.toLocaleDateString(
            "vi-VN"
          )}`;
        }
      }

      if (textInputs.name) textInputs.name.value = fullName || "";
      if (textInputs.email) textInputs.email.value = email || "";
      if (textInputs.phone) textInputs.phone.value = phone || "";
      if (textInputs.department) textInputs.department.value = department || "";

      if (avatarEl) {
        const initials =
          user.initials ||
          layout?.userDisplay?.initials ||
          deriveInitials(fullName || username);
        avatarEl.textContent = initials || "--";
      }
    }

    function memoizeProfile() {
      if (!layout) return;
      if (layout.user) {
        applyUserProfile(layout.user);
      }
      if (typeof layout.ensureUser === "function") {
        layout
          .ensureUser()
          .then((user) => {
            if (user) applyUserProfile(user);
          })
          .catch(() => {});
      }
    }

    function setEditMode(on) {
      inputs.forEach((el) => (el.disabled = !on));
      btnEdit?.classList.toggle("hidden", on);
      btnSave?.classList.toggle("hidden", !on);
      btnCancel?.classList.toggle("hidden", !on);
    }

    btnEdit?.addEventListener("click", () => {
      snapshot = Object.fromEntries(inputs.map((el) => [el.id, el.value]));
      setEditMode(true);
      inputs[0]?.focus();
    });

    btnCancel?.addEventListener("click", () => {
      inputs.forEach((el) => {
        if (snapshot[el.id] != null) el.value = snapshot[el.id];
      });
      setEditMode(false);
      toast("Đã huỷ thay đổi.");
    });

    async function handleProfileSave() {
      const email = qs("#inpEmail").value.trim();
      const name = qs("#inpName").value.trim();
      const phone = qs("#inpPhone").value.trim();
      console.debug("[lanhdao] handleProfileSave invoked", {
        name,
        email,
        phone,
      });

      if (!name) return toast("Vui lòng nhập họ và tên.", "error");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return toast("Email không hợp lệ.", "error");

      const apiClient = getApiClient();
      if (!apiClient || typeof apiClient.updateProfile !== "function") {
        return toast("Không thể lưu thông tin lúc này.", "error");
      }

      setEditMode(false);
      btnSave.disabled = true;
      const originalLabel = btnSave.textContent || "Lưu thay đổi";
      btnSave.textContent = "Đang lưu...";

      try {
        const updated = await apiClient.updateProfile({
          full_name: name,
          email,
          phone,
        });
        if (updated) {
          layout.user = updated;
          applyUserProfile(updated);
        }
        toast("Đã lưu thông tin tài khoản.", "success");
      } catch (err) {
        const message =
          err?.data?.detail ||
          err?.message ||
          "Không thể lưu. Vui lòng thử lại.";
        toast(message, "error");
      } finally {
        btnSave.disabled = false;
        btnSave.textContent = originalLabel;
      }
    }

    btnSave?.addEventListener("click", handleProfileSave);

    const modal = qs("#pwdModal");
    const pwdForm = qs("#pwdForm");
    const openPwd = qs("#btnOpenPwd");
    const closePwd = qs("#pwdClose");
    const cancelPwd = qs("#pwdCancel");
    const curPwd = qs("#curPwd");
    const newPwd = qs("#newPwd");
    const cfmPwd = qs("#cfmPwd");
    const pwdLast = qs("#pwdLastChanged");
    const submitPwd = qs("#pwdSubmit");

    function openModal() {
      modal?.classList.remove("hidden");
      setTimeout(() => curPwd?.focus(), 10);
    }
    function closeModal() {
      modal?.classList.add("hidden");
      clearPasswordInputs();
    }

    function clearPasswordInputs() {
      [curPwd, newPwd, cfmPwd].forEach((input) => {
        if (input) input.value = "";
      });
    }

    openPwd?.addEventListener("click", openModal);
    closePwd?.addEventListener("click", closeModal);
    cancelPwd?.addEventListener("click", closeModal);
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });

    const logPrefix = "[lanhdao]";
    function getSubmitButton() {
      return submitPwd || pwdForm?.querySelector('button[type="submit"]');
    }

    async function handlePasswordSubmit(event) {
      if (event) event.preventDefault();
      console.info(`${logPrefix} password submit triggered`);
      const current = curPwd?.value?.trim() || "";
      const next = newPwd?.value?.trim() || "";
      const confirm = cfmPwd?.value?.trim() || "";

      console.info(`${logPrefix} payload`, {
        hasCurrent: Boolean(current),
        newPasswordLength: next.length,
      });

      if (!current || !next || !confirm) {
        toast("Vui lòng nhập đầy đủ thông tin.", "error");
        return;
      }
      if (next.length < 8) {
        toast("Mật khẩu mới tối thiểu 8 ký tự.", "error");
        return;
      }
      if (next !== confirm) {
        toast("Xác nhận mật khẩu chưa khớp.", "error");
        return;
      }
      if (next === current) {
        toast("Mật khẩu mới không được trùng mật khẩu hiện tại.", "error");
        return;
      }

      const apiClient = getApiClient();
      if (!apiClient || typeof apiClient.changePassword !== "function") {
        console.warn(`${logPrefix} ApiClient unavailable`);
        toast("Không thể đổi mật khẩu lúc này.", "error");
        return;
      }

      const submitBtn = getSubmitButton();
      if (submitBtn) submitBtn.disabled = true;
      try {
        console.info(`${logPrefix} calling changePassword API`);
        await apiClient.changePassword({
          current_password: current,
          new_password: next,
          new_password_confirm: confirm,
        });
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, "0");
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const yyyy = today.getFullYear();
        if (pwdLast) {
          pwdLast.textContent = `${dd}/${mm}/${yyyy}`;
        }
        toast("Đã cập nhật mật khẩu.", "success");
        closeModal();
      } catch (err) {
        console.error(`${logPrefix} changePassword failed`, err);
        const message =
          err?.data?.detail ||
          err?.message ||
          "Không thể đổi mật khẩu. Vui lòng thử lại.";
        toast(message, "error");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    }

    console.info(`${logPrefix} binding password handler`);
    pwdForm?.addEventListener("submit", handlePasswordSubmit);

    const signinList = qs("#signinList");

    function escapeHtml(value) {
      const text = String(value || "");
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return text.replace(/[&<>"']/g, (ch) => map[ch] || ch);
    }

    function formatDateTime(value) {
      if (!value) return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      return date.toLocaleString("vi-VN");
    }

    function renderSessions(records = []) {
      if (!signinList) return;
      const apiClient = getApiClient();
      const list = Array.isArray(records) ? records : [];
      if (!list.length) {
        signinList.innerHTML =
          '<li class="px-4 py-3 text-[13px] text-slate-500">Chưa có phiên đăng nhập nào.</li>';
        return;
      }
      const currentSession =
        apiClient?.getSessionId && typeof apiClient.getSessionId === "function"
          ? apiClient.getSessionId()
          : null;
      signinList.innerHTML = list
        .map((session) => {
          const sessionId = String(
            session.session_id || session.sessionId || session.id || ""
          );
          if (!sessionId) {
            return "";
          }
          const issued = formatDateTime(session.issued_at || session.issuedAt);
          const expires = formatDateTime(
            session.expires_at || session.expiresAt
          );
          const device =
            session.user_agent ||
            session.device ||
            "Trình duyệt không xác định";
          const ip = session.ip || "IP ẩn danh";
          const revoked = Boolean(session.revoked);
          const isCurrent =
            currentSession &&
            currentSession.toString() === sessionId.toString();
          const badgeClass = revoked
            ? "chip chip--rose"
            : isCurrent
            ? "chip chip--blue"
            : "chip chip--green";
          const badgeLabel = revoked
            ? "Đã thu hồi"
            : isCurrent
            ? "Phiên hiện tại"
            : "Hoạt động";
          const safeId = sessionId.replace(/["']/g, "");
          const actionButton =
            !revoked && !isCurrent
              ? `<button type="button" data-revoke-session="${safeId}" class="text-[12px] text-slate-900 hover:underline">Thu hồi</button>`
              : "";
          return `
            <li class="px-4 py-3 flex items-center justify-between">
              <div class="min-w-0">
                <div class="font-medium text-[13.5px]">${escapeHtml(
                  device
                )}</div>
                <div class="text-[12px] text-slate-500">
                  ${
                    issued
                      ? `Đăng nhập lúc ${escapeHtml(issued)}`
                      : "Thời điểm không xác định"
                  }
                  ${ip ? ` • IP ${escapeHtml(ip)}` : ""}
                </div>
                ${
                  expires
                    ? `<div class="text-[11px] text-slate-400">Hết hạn ${escapeHtml(
                        expires
                      )}</div>`
                    : ""
                }
              </div>
              <div class="flex items-center gap-2">
                <span class="${badgeClass}">${badgeLabel}</span>
                ${actionButton}
              </div>
            </li>
          `;
        })
        .join("");
    }

    async function loadSessions() {
      if (!signinList) return;
      const apiClient = getApiClient();
      if (!apiClient || typeof apiClient.listSessions !== "function") {
        renderSessions();
        return;
      }
      signinList.innerHTML =
        '<li class="px-4 py-3 text-[13px] text-slate-500">Đang tải phiên đăng nhập...</li>';
      try {
        const records = await apiClient.listSessions();
        renderSessions(records);
      } catch (err) {
        console.error("[lanhdao] loadSessions failed", err);
        signinList.innerHTML =
          '<li class="px-4 py-3 text-[13px] text-rose-600">Không thể tải lịch sử đăng nhập.</li>';
      }
    }

    signinList?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-revoke-session]");
      if (!button) return;
      const sessionId = button.dataset.revokeSession;
      const apiClient = getApiClient();
      if (
        !sessionId ||
        !apiClient ||
        typeof apiClient.revokeSession !== "function"
      )
        return;
      button.disabled = true;
      try {
        await apiClient.revokeSession(sessionId);
        toast("Đã thu hồi phiên đăng nhập.", "success");
        await loadSessions();
      } catch (err) {
        const message =
          err?.data?.detail ||
          err?.message ||
          "Không thể thu hồi phiên đăng nhập.";
        toast(message, "error");
      } finally {
        button.disabled = false;
      }
    });

    memoizeProfile();
    loadSessions();

    const logoutBtn = qs("#btnLogout");
    if (logoutBtn) {
      logoutBtn.dataset.action = logoutBtn.dataset.action || "logout";
      logoutBtn.dataset.logoutConfirm =
        logoutBtn.dataset.logoutConfirm || "Bạn có chắc muốn đăng xuất?";
      window.Layout?.setupLogoutHandler?.();
    }
  };

  function showDetailToast(message, type = "info") {
    const toastEl = document.getElementById("toast");
    if (!toastEl) {
      console.log(message);
      return;
    }
    toastEl.textContent = message;
    toastEl.classList.remove(
      "toast--show",
      "toast--error",
      "toast--success",
      "toast--warn"
    );
    if (type === "error") toastEl.classList.add("toast--error");
    else if (type === "success") toastEl.classList.add("toast--success");
    else if (type === "warn") toastEl.classList.add("toast--warn");
    toastEl.classList.add("toast--show");
    setTimeout(() => toastEl.classList.remove("toast--show"), 2200);
  }
})();
