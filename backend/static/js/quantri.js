/* ============================================================
   quantri.js
   Admin module interactions for dashboard & management pages.
   Re-created after binary corruption detected on 2025-11-07.
============================================================ */

function formatNumber(value, options = {}) {
  if (value === null || value === undefined) {
    return "0";
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "0";
  }
  const { minimumFractionDigits, maximumFractionDigits, decimals } = options;
  const minFrac =
    typeof minimumFractionDigits === "number"
      ? minimumFractionDigits
      : typeof decimals === "number"
      ? decimals
      : 0;
  const maxFrac =
    typeof maximumFractionDigits === "number"
      ? maximumFractionDigits
      : typeof decimals === "number"
      ? decimals
      : minFrac;
  return num.toLocaleString("vi-VN", {
    minimumFractionDigits: minFrac,
    maximumFractionDigits: maxFrac,
  });
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString("vi-VN", { hour12: false });
}

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

function humanReadableStorage(bytes, decimals = 1) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 GB";
  }
  const gb = bytes / 1024 / 1024 / 1024;
  return `${formatNumber(gb, { decimals })} GB`;
}

function animateValue(element, target, options = {}) {
  if (!element) {
    return;
  }
  const duration = Number(options.duration) || 600;
  const decimals =
    typeof options.decimals === "number"
      ? options.decimals
      : typeof options.precision === "number"
      ? options.precision
      : 0;
  const startValue = Number(element.dataset.startValue ?? element.textContent ?? 0) || 0;
  const endValue = Number(target) || 0;
  const diff = endValue - startValue;
  let startTime = null;

  const step = (timestamp) => {
    if (!startTime) {
      startTime = timestamp;
    }
    const progress = Math.min(1, (timestamp - startTime) / duration);
    const current = startValue + diff * progress;
    element.textContent = formatNumber(current, { decimals });
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  };

  requestAnimationFrame(step);
}

function createDebounce(defaultDelay = 120) {
  return (fn, wait = defaultDelay) => {
    if (typeof fn !== "function") {
      return () => {};
    }
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  };
}

function createToast() {
  return (msg, type = "info") => {
    const toastEl = document?.querySelector("#toast");
    if (!toastEl) {
      window.alert?.(msg);
      return;
    }
    toastEl.textContent = msg;
    toastEl.classList.remove("toast--show", "toast--success", "toast--error", "toast--warn");
    toastEl.classList.add("toast--show");
    if (type === "success") toastEl.classList.add("toast--success");
    else if (type === "error") toastEl.classList.add("toast--error");
    else if (type === "warn") toastEl.classList.add("toast--warn");
    setTimeout(() => toastEl.classList.remove("toast--show"), 2000);
  };
}

  const adminCache = {
    departments: [],
    roles: [],
  };

  async function ensureAdminDepartments() {
    const api = window.ApiClient;
    if (!api?.departments) {
      return adminCache.departments;
    }
    if (adminCache.departments.length) {
      return adminCache.departments;
    }
    try {
      const response = await api.departments.list({ page_size: 400 });
      adminCache.departments = api.extractItems(response);
    } catch (error) {
      console.warn("[quantri] ensureAdminDepartments failed", error);
    }
    return adminCache.departments;
  }

  async function ensureAdminRoles() {
    const api = window.ApiClient;
    if (!api?.roles) {
      return adminCache.roles;
    }
    if (adminCache.roles.length) {
      return adminCache.roles;
    }
    try {
      const response = await api.roles.list({ page_size: 400 });
      adminCache.roles = api.extractItems(response);
    } catch (error) {
      console.warn("[quantri] ensureAdminRoles failed", error);
    }
    return adminCache.roles;
  }

function initModal(selector) {
  const element = document.querySelector(selector);
  if (!element) {
    return {
      open: () => {},
      close: () => {},
      form: null,
    };
  }
  const form = element.querySelector("form");
  const closeListeners = element.querySelectorAll('[data-close-modal="true"]');
  const openModal = () => {
    element.classList.remove("hidden");
    element.setAttribute("aria-hidden", "false");
  };
  const closeModal = () => {
    element.classList.add("hidden");
    element.setAttribute("aria-hidden", "true");
  };
  closeListeners.forEach((button) => button.addEventListener("click", closeModal));
  element.addEventListener("click", (event) => {
    if (event.target === element) {
      closeModal();
    }
  });
  return {
    open: openModal,
    close: closeModal,
    form,
  };
}

(function () {
  "use strict";

  const doc = document;
  const body = doc.body;
  const $ = (selector, root = doc) => (root ? root.querySelector(selector) : null);
  const $$ = (selector, root = doc) => (root ? Array.from(root.querySelectorAll(selector)) : []);
  const noop = () => {};

  function toggleDropdown(trigger) {
    if (!trigger) return;
    const targetSelector = trigger.dataset.dropdown;
    if (!targetSelector) return;
    const target = document.querySelector(targetSelector);
    if (!target) return;
    const isOpen = !target.classList.contains("hidden");
    if (isOpen) {
      target.classList.add("hidden");
    } else {
      closeAllDropdowns();
      target.classList.remove("hidden");
    }
  }

  function closeAllDropdowns() {
    const menus = document.querySelectorAll(".dropdown-menu");
    menus.forEach((menu) => {
      menu.classList.add("hidden");
    });
  }

  function closeDropdown(menu) {
    if (menu) {
      menu.classList.add("hidden");
    }
  }

  const normalizeText = (value) =>
    (value || "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[^\w\s]+/g, " ")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const toNumber = (value, fallback = 0) => {
    const num = Number.parseFloat(String(value).replace(/[,.\s]/g, (ch) => (ch === "," ? "." : "")));
    return Number.isFinite(num) ? num : fallback;
  };

  const archiveState = {
    backups: [],
    policies: [],
  };

  let archiveAuthNoticeElement = null;

  function setArchiveAuthNotice(message) {
    if (!archiveAuthNoticeElement) {
      return;
    }
    if (!message) {
      archiveAuthNoticeElement.textContent = "";
      archiveAuthNoticeElement.classList.add("hidden");
      return;
    }
    archiveAuthNoticeElement.textContent = message;
    archiveAuthNoticeElement.classList.remove("hidden");
  }

  const AdminRuntime = {
    debounce: window.TrisApp?.debounce || createDebounce(),
    toast: window.TrisApp?.showToast || createToast(),
  };

  exposeGlobals();
  onReady(() => {
    bootstrapLayout();
    const page = detectPage();
    const controllers = {
      dashboard: initDashboard,
      nguoidung: initNguoiDung,
      "nguoidung-detail": initNguoiDungDetail,
      phanquyen: initPhanQuyen,
      danhmuc: initDanhMuc,
      cauhinh: initCauHinh,
      hosoluutru: initHoSoLuuTru,
      thongbaonhacviec: initThongBaoNhacViec,
      thongkebaocao: initThongKe,
      taikhoan: initTaiKhoan,
      quanlyhethong: initQuanLyHeThong,
    };
    // Fallback: nếu map trang bị lệch tên file, vẫn đảm bảo trang danh mục được kích hoạt
    const fallbackPage = controllers[page]
      ? page
      : /danhmuc/.test(location.pathname)
      ? "danhmuc"
      : page;
    (controllers[fallbackPage] || noop)();
  });

  function onReady(callback) {
    if (typeof callback !== "function") return;
    if (doc.readyState === "complete" || doc.readyState === "interactive") {
      queueMicrotask(callback);
      return;
    }
    doc.addEventListener("DOMContentLoaded", callback, { once: true });
  }

  function detectPage() {
    const explicit = body?.dataset?.page;
    if (explicit) {
      return explicit.toLowerCase();
    }
    const path = (location.pathname || "dashboard.html").split("/").pop() || "dashboard.html";
    const clean = path.split(/[?#]/)[0].replace(/\.html$/i, "").toLowerCase();
    if (!clean || clean === "index") return "dashboard";
    const aliases = {
      danhmucdetail: "danhmuc-detail",
      thongbao: "thongbaonhacviec",
      danhmuchethong: "danhmuc",
      "danhmuchethong-detail": "danhmuc-detail",
      danhmuchethongdetail: "danhmuc-detail",
      danhmuc_hethong: "danhmuc",
      danhmuc_he_thong: "danhmuc",
      danhmuc_hethong_detail: "danhmuc-detail",
      danhmuc_he_thong_detail: "danhmuc-detail",
      danhmuchesystem: "danhmuc",
      danhmuchesystem_detail: "danhmuc-detail",
    };
    return aliases[clean] || clean;
  }

  function bootstrapLayout() {
    const sidebar = $("#sidebar");
    const toggleBtn = $("#btnSidebar") || $("#btn-sidebar");
    if (sidebar && toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        const isOpen = !sidebar.classList.contains("-translate-x-full");
        sidebar.classList.toggle("-translate-x-full", isOpen);
        sidebar.classList.toggle("hidden", isOpen);
        toggleBtn.setAttribute("aria-expanded", String(!isOpen));
      });
    }

    doc.addEventListener("click", (event) => {
      const dropdown = event.target.closest("[data-dropdown]");
      if (dropdown) {
        toggleDropdown(dropdown);
        return;
      }
      if (!event.target.closest(".dropdown-menu")) {
        closeAllDropdowns();
      }
    });

    $$("[data-quick-toast]").forEach((btn) => {
      btn.addEventListener("click", () => AdminRuntime.toast(btn.dataset.quickToast));
    });
  }

  function exposeGlobals() {
    window.AdminApp = Object.assign({}, window.AdminApp, {
      showToast: AdminRuntime.toast,
      debounce: AdminRuntime.debounce,
      formatNumber,
      animateValue,
    });
  }

  /* --------------------------- Dashboard --------------------------- */
  function initDashboard() {
    animateDashboardMetrics();
    wireDashboardActions();
    hydrateAuditTimeline();
    loadDashboardKPIs();
  }

  async function loadDashboardKPIs() {
    const api = window.ApiClient;
    if (!api || typeof api.request !== 'function') {
      console.info('[quantri] ApiClient not available, using static dashboard values');
      return;
    }

    try {
      const response = await api.request('/api/v1/analytics/dashboard', {
        method: 'GET'
      });

      if (!response || !response.success || !response.data) {
        console.warn('[quantri] Invalid dashboard KPI response format');
        return;
      }

      const kpis = response.data;

      // Update Total Documents
      if (kpis.total_documents) {
        const docEl = $('#metricDocs');
        const doneEl = $('#metricDocsDone');
        if (docEl) {
          animateValue(docEl, kpis.total_documents.count || 0, { duration: 800 });
        }
        if (doneEl && kpis.processing_efficiency) {
          const completedCount = kpis.processing_efficiency.completed || 0;
          animateValue(doneEl, completedCount, { duration: 800 });
        }
      }

      // Update Active Users
      if (kpis.active_users) {
        const userEl = $('#metricUsers');
        const activeEl = $('#metricUsersActive');
        if (userEl) {
          animateValue(userEl, kpis.active_users.total || 0, { duration: 800 });
        }
        if (activeEl) {
          animateValue(activeEl, kpis.active_users.active || 0, { duration: 800 });
        }
      }

      // Update Overdue/Alerts
      if (kpis.overdue_rate) {
        const alertEl = $('#metricAlerts');
        if (alertEl) {
          animateValue(alertEl, kpis.overdue_rate.count || 0, { duration: 800 });
        }
      }

      // Update Processing Efficiency (if displayed as storage percentage for now)
      if (kpis.processing_efficiency) {
        const storageEl = $('#metricStorage');
        if (storageEl) {
          const efficiencyRate = Math.round(kpis.processing_efficiency.rate || 0);
          storageEl.textContent = `${efficiencyRate}%`;
        }
      }

      console.info('[quantri] Dashboard KPIs loaded successfully', kpis);
    } catch (error) {
      console.warn('[quantri] Failed to load dashboard KPIs, using static values', error);
    }
  }

  function animateDashboardMetrics() {
    const counters = $$('[data-kpi], [data-metric], [data-counter], #metricUsers, #metricDocs');
    counters.forEach((el) => {
      const target = toNumber(el.dataset.target || el.textContent, 0);
      animateValue(el, target, { duration: 600 });
    });

    $$('[data-progress-value]').forEach((bar) => {
      const target = Number(bar.dataset.progressValue) || 0;
      bar.style.width = '0%';
      requestAnimationFrame(() => {
        bar.style.transition = 'width .8s ease';
        bar.style.width = `${Math.min(100, Math.max(0, target))}%`;
      });
    });
  }

  function wireDashboardActions() {
    $$("[data-action]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        const action = btn.dataset.action;
        const target = event.currentTarget?.dataset?.target || "";
        const message = btn.dataset.message || `Thao tác '${action || "action"}' đã thực hiện.`;
        AdminRuntime.toast(message.replace("{target}", target || ""));
      });
    });
  }

  function hydrateAuditTimeline() {
    const list = $("#adminTimeline");
    if (!list) return;
    const items = $$("li", list);
    if (!items.length) return;
    const now = new Date();
    items.forEach((item, index) => {
      const badge = item.querySelector("time");
      if (badge?.dateTime) {
        const parsed = new Date(badge.dateTime);
        if (!Number.isNaN(parsed.getTime())) {
          if (!badge.textContent.trim()) {
            badge.textContent = formatDateTime(parsed);
          }
          badge.setAttribute("title", formatDateTime(parsed));
        }
      }
      item.style.animationDelay = `${index * 60}ms`;
    });
  }

  function initNguoiDung() {
    const api = window.ApiClient || null;
    if (!api) {
      console.warn("[quantri] ApiClient missing, skipping nguoidung initialization");
      return;
    }

    (async () => {
      const hasToken =
        typeof api.getAccessToken === "function"
          ? Boolean(api.getAccessToken())
          : Boolean(api.accessToken);
      if (!hasToken) {
        console.warn("[quantri] No access token available, skipping nguoidung init");
        return;
      }

      let authenticated = true;
      if (typeof api.ensureAuthenticated === "function") {
        try {
          authenticated = await api.ensureAuthenticated();
        } catch (err) {
          console.warn("[quantri] ensureAuthenticated failed", err);
          authenticated = false;
        }
      }

      if (!authenticated) {
        console.warn("[quantri] User is not authenticated, skipping nguoidung init");
        return;
      }

      if (typeof initNguoiDungApi === "function") {
        initNguoiDungApi();
      } else {
        console.warn("[quantri] initNguoiDungApi is not available");
      }
    })();
  }

  function initNguoiDungApi() {
    const tableBody = $("#user-table");
    if (!tableBody) return;
    const searchInput = $("#user-search");
    const countEls = [$("#userCount"), $("#userCountBottom")].filter(Boolean);
    const kpiTotal = $("#kpiTotalUsers");
    const kpiActive = $("#kpiActiveUsers");
    const kpiCV = $("#kpiCV");
    const kpiQT = $("#kpiQT");
    const api = window.ApiClient || null;
    const extractItems = (payload) => {
      if (api && typeof api.extractItems === "function") {
        return api.extractItems(payload);
      }
      if (Array.isArray(payload)) {
        return payload;
      }
      return payload?.items || [];
    };
    const state = { keyword: "", role: "all", dept: "all", status: "all" };
    let cachedUsers = [];
    const ROLE_DISPLAY_LABELS = {
      QT: "Quản trị",
      VT: "Văn thư",
      CV: "Chuyên viên",
      LD: "Lãnh đạo",
    };
    const ROLE_SLUGS = { QT: "qt", VT: "vt", CV: "cv", LD: "ld" };
    const ROLE_CODE_ALIASES = {
      QUAN_TRI: "QT",
      QT: "QT",
      VAN_THU: "VT",
      VT: "VT",
      CHUYEN_VIEN: "CV",
      CV: "CV",
      LANH_DAO: "LD",
      LD: "LD",
    };
    const STATUS_LABELS = { active: "Hoạt động", locked: "Tạm khóa" };
    const DEPT_OVERRIDES = {
      "Phòng Hành chính": "hanhchinh",
      "Văn phòng UBND": "vp-ubnd",
      "Văn phòng Chủ tịch": "vp-ct",
    };

    const slugify = (value) =>
      (value || "")
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

    const normalizeRoleKey = (value) =>
      (value || "")
        .toString()
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\W_]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toUpperCase();

    const getCanonicalRoleCode = (role) => {
      const raw = (role?.name || role?.description || "").toString().trim();
      if (!raw) return "";
      const normalized = normalizeRoleKey(raw);
      if (normalized && ROLE_CODE_ALIASES[normalized]) {
        return ROLE_CODE_ALIASES[normalized];
      }
      if (ROLE_CODE_ALIASES[raw.toUpperCase()]) {
        return ROLE_CODE_ALIASES[raw.toUpperCase()];
      }
      return "";
    };

    const getRoleSlug = (role) => {
      const canonical = getCanonicalRoleCode(role);
      if (canonical && ROLE_SLUGS[canonical]) {
        return ROLE_SLUGS[canonical];
      }
      if (role?.display_name) {
        return slugify(role.display_name);
      }
      if (role?.description) {
        return slugify(role.description);
      }
      if (role?.name) {
        return slugify(role.name);
      }
      return "";
    };

    const getRoleLabel = (role) => {
      const canonical = getCanonicalRoleCode(role);
      if (canonical && ROLE_DISPLAY_LABELS[canonical]) {
        return ROLE_DISPLAY_LABELS[canonical];
      }
      return role?.display_name || role?.description || role?.name || "Vai trò";
    };

    const getDepartmentSlug = (userOrDepartment) => {
      // Hỗ trợ cả object user (với flat fields) và object department (nested)
      if (!userOrDepartment) return "unknown";
      
      // Nếu có department_code trực tiếp (flat field từ user)
      const deptCode = userOrDepartment.department_code || userOrDepartment.department?.department_code;
      if (deptCode) {
        return slugify(deptCode);
      }
      
      // Nếu có department_name trực tiếp (flat field từ user) hoặc nested
      const deptName = userOrDepartment.department_name || userOrDepartment.department?.name || userOrDepartment.name;
      if (deptName && DEPT_OVERRIDES[deptName]) {
        return DEPT_OVERRIDES[deptName];
      }
      if (deptName) {
        return slugify(deptName);
      }
      
      return "unknown";
    };

    const getDepartmentLabel = (userOrDepartment) => {
      // Hỗ trợ cả object user (với flat fields) và object department (nested)
      if (!userOrDepartment) return "Chưa phân";
      return userOrDepartment.department_name || userOrDepartment.department?.name || userOrDepartment.name || "Chưa phân";
    };

    const userFormModal = initModal("#manageUserModal");
    const userForm = userFormModal?.form;
    const userFormTitle = $("#userFormTitle");
    const userDeptSelect = $("#userDeptSelect");
    const userRoleSelect = $("#userRoleSelect");
    const userFullName = $("#userFullName");
    const userUsername = $("#userUsername");
    const userEmail = $("#userEmail");
    const userPhone = $("#userPhone");
    const userCode = $("#userCode");
    const userPassword = $("#userPassword");
    const userActiveSwitch = $("#userActiveSwitch");
    const userFormFeedback = $("#userFormFeedback");
    const userFormSubmit = $("#userFormSubmit");
    const addUserBtn = $("#btn-add-user");
    const userFormState = { mode: "create", user: null };

    const renderDepartmentOptions = (departments) => {
      if (!userDeptSelect) return;
      const options = [
        '<option value="">Không chọn</option>',
        ...departments.map((dept) => {
          const code = escapeHtml(dept.department_code || `PB-${dept.department_id}`);
          const name = escapeHtml(dept.name || "Phòng ban chưa đặt tên");
          return `<option value="${escapeHtml(dept.department_id)}">${code} • ${name}</option>`;
        }),
      ];
      userDeptSelect.innerHTML = options.join("");
    };

    const renderRoleOptions = (roles) => {
      if (!userRoleSelect) return;
      const canonicalMap = new Map();
      roles.forEach((role) => {
        const code = getCanonicalRoleCode(role);
        if (!code) return;
        if (!canonicalMap.has(code)) {
          canonicalMap.set(code, role);
        }
      });
      const toRender = canonicalMap.size ? Array.from(canonicalMap.values()) : roles;
      const options = toRender.map((role) => {
        const value = escapeHtml(role.role_id);
        const label = escapeHtml(getRoleLabel(role));
        return `<option value="${value}">${label}</option>`;
      });
      userRoleSelect.innerHTML = options.join("");
      syncUserSelections();
    };

    const syncUserSelections = () => {
      if (!userFormState.user) return;
      const departmentId = userFormState.user.department_id;
      if (departmentId !== undefined && userDeptSelect) {
        userDeptSelect.value = departmentId ? String(departmentId) : "";
      }
      if (userRoleSelect) {
        const selectedIds = new Set(
          (userFormState.user.roles || []).map((role) => String(role.role_id))
        );
        Array.from(userRoleSelect.options).forEach((option) => {
          option.selected = selectedIds.has(option.value);
        });
      }
    };

    const populateAdminSelects = async () => {
      const [departments, roles] = await Promise.all([ensureAdminDepartments(), ensureAdminRoles()]);
      renderDepartmentOptions(departments);
      renderRoleOptions(roles);
    };

    populateAdminSelects();

    const resetUserFormFeedback = () => {
      if (userFormFeedback) {
        userFormFeedback.textContent = "";
      }
    };

    const clearUserForm = () => {
      if (userForm) {
        userForm.reset();
      }
      userPassword && (userPassword.value = "");
      userActiveSwitch && (userActiveSwitch.checked = true);
      if (userRoleSelect) {
        Array.from(userRoleSelect.options).forEach((option) => {
          option.selected = false;
        });
      }
    };

    const openUserForm = (mode, user = null) => {
      userFormState.mode = mode;
      userFormState.user = user;
      clearUserForm();
      if (userFormTitle) {
        userFormTitle.textContent = mode === "edit" ? "Chỉnh sửa người dùng" : "Thêm người dùng";
      }
      if (userFullName) userFullName.value = user?.full_name || "";
      if (userUsername) userUsername.value = user?.username || "";
      if (userEmail) userEmail.value = user?.email || "";
      if (userPhone) userPhone.value = user?.phone || "";
      if (userCode) userCode.value = user?.user_code || "";
      if (userActiveSwitch) userActiveSwitch.checked = user?.is_active ?? true;
      resetUserFormFeedback();
      syncUserSelections();
      if (userFormState.user && userFormFeedback) {
        userFormFeedback.textContent = "";
      }
      userPassword && (userPassword.value = "");
      userFormModal?.open();
    };

    addUserBtn?.addEventListener("click", () => openUserForm("create"));

    const getSelectedRoleIds = () => {
      if (!userRoleSelect) return [];
      return Array.from(userRoleSelect.selectedOptions)
        .map((option) => Number(option.value))
        .filter((value) => Number.isFinite(value));
    };
    const updateDropdownEntries = (selector, dataAttr, entries) => {
      const menu = document.querySelector(selector);
      if (!menu) return;

      if (menu.tagName === "SELECT") {
        const current = menu.value;
        const options = [];
        // Keep default "all" if exists
        const defaultOption =
          Array.from(menu.options).find((opt) => opt.value === "all") ||
          new Option("Tất cả", "all");
        options.push(defaultOption);
        entries.forEach(({ slug, label }) => {
          if (!slug) return;
          options.push(new Option(label, slug));
        });
        menu.innerHTML = "";
        options.forEach((opt) => menu.appendChild(opt));
        if (current && Array.from(menu.options).some((opt) => opt.value === current)) {
          menu.value = current;
        }
        return;
      }

      menu
        .querySelectorAll(`.dropdown-item[data-${dataAttr}]:not([data-${dataAttr}="all"])`)
        .forEach((item) => item.remove());
      entries.forEach(({ slug, label }) => {
        if (!slug) return;
        if (menu.querySelector(`[data-${dataAttr}="${slug}"]`)) {
          return;
        }
        const button = document.createElement("button");
        button.type = "button";
        button.className = "dropdown-item";
        button.dataset[dataAttr] = slug;
        button.textContent = label;
        menu.appendChild(button);
      });
    };

    const buildRoleChips = (roles = []) => {
      if (!roles.length) {
        return '<span class="chip">Chưa phân vai trò</span>';
      }
      const palette = {
        cv: "chip--green",
        vt: "chip--amber",
        ld: "chip--purple",
        qt: "chip--rose",
      };
      return roles
        .map((role) => {
          const slug = getRoleSlug(role) || "default";
          const label = escapeHtml(getRoleLabel(role));
          return `<span class="chip ${palette[slug] || "chip"}">${label}</span>`;
        })
        .join("");
    };

    const createUserRow = (user) => {
      const avatarText =
        user.initials ||
        (user.full_name || "")
          .split(/\s+/)
          .filter(Boolean)
          .slice(-2)
          .map((token) => token[0])
          .join("")
          .toUpperCase() ||
        (user.username || "").slice(0, 2).toUpperCase();
      const username = user.username ? `@${user.username}` : "";
      const detailUrl = `/quantri/nguoidung-detail.html?id=${encodeURIComponent(user.user_id || "")}`;
      const contactParts = [];
      if (user.email) {
        contactParts.push(
          `<div class="flex items-center gap-2"><span class="text-slate-500" aria-hidden="true">✉️</span><span>${escapeHtml(
            user.email
          )}</span></div>`
        );
      }
      if (user.phone) {
        contactParts.push(
          `<div class="flex items-center gap-2"><span class="text-slate-500" aria-hidden="true">📞</span><span>${escapeHtml(
            user.phone
          )}</span></div>`
        );
      }
      const deptSlug = getDepartmentSlug(user);
      const statusClass = user.is_active ? "badge--dark" : "badge--muted";
      const statusLabel = STATUS_LABELS[user.is_active ? "active" : "locked"];
      return `<tr data-user-id="${escapeHtml(user.user_id)}" data-role="${escapeHtml(
        getRoleSlug((user.roles || [])[0]) || "all"
      )}" data-dept="${escapeHtml(deptSlug)}" data-status="${user.is_active ? "active" : "locked"}">
        <td class="px-4 py-3">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-slate-100 grid place-items-center text-[12px] font-semibold text-slate-600">
              ${escapeHtml(avatarText)}
            </div>
            <div>
              <div class="font-medium">${escapeHtml(user.full_name || username || "Người dùng")}</div>
              <div class="text-slate-500">${escapeHtml(username)}</div>
              <div class="text-[12px] text-slate-500">
                ${escapeHtml(user.user_code || "Mã chưa có")}
              </div>
            </div>
          </div>
        </td>
        <td class="px-4 py-3">${buildRoleChips(user.roles)}</td>
        <td class="px-4 py-3">${escapeHtml(getDepartmentLabel(user))}</td>
        <td class="px-4 py-3">
          <div class="space-y-0.5">
            ${
              contactParts.length
                ? contactParts.join("")
                : '<div class="text-[12px] text-slate-400">Chưa có liên hệ</div>'
            }
          </div>
        </td>
        <td class="px-4 py-3">
          <label class="inline-flex items-center gap-2">
            <input type="checkbox" class="toggle" data-user-status ${user.is_active ? "checked" : ""} />
            <span class="badge ${statusClass}">${statusLabel}</span>
          </label>
        </td>
        <td class="px-4 py-3 text-slate-600">${formatDateTime(user.created_at)}</td>
        <td class="px-4 py-3 text-slate-600">${user.last_login ? formatDateTime(user.last_login) : "Chưa đăng nhập"}</td>
        <td class="px-4 py-3">
          <div class="flex items-center gap-2">
            <a class="btn-icon" title="Xem" href="${detailUrl}">
              <span class="text-xs font-semibold">Xem</span>
            </a>
            <button
              type="button"
              class="btn-icon"
              title="Sửa"
              data-action="edit-user"
              data-user-id="${escapeHtml(user.user_id)}"
            >
              <span class="text-xs font-semibold">Sửa</span>
            </button>
            <button
              type="button"
              class="btn-icon text-rose-600 hover:bg-rose-50"
              title="Xóa"
              data-action="delete-user"
              data-user-id="${escapeHtml(user.user_id)}"
              data-user-name="${escapeHtml(user.full_name || user.username || "")}"
            >
              <span class="text-xs font-semibold">Xóa</span>
            </button>
          </div>
        </td>
      </tr>`;
    };

    const renderUsers = (list) => {
      if (!tableBody) return;
      if (!list.length) {
        tableBody.innerHTML =
          '<tr><td colspan="8" class="px-4 py-6 text-center text-[13px] text-slate-500">Chưa có người dùng phù hợp.</td></tr>';
        countEls.forEach((el) => {
          if (!el) return;
          if (el.id === "userCount") {
            el.textContent = "(0)";
          } else {
            el.textContent = "0";
          }
        });
        return;
      }
      tableBody.innerHTML = list.map(createUserRow).join("");
      countEls.forEach((el) => {
        if (!el) return;
        if (el.id === "userCount") {
          el.textContent = `(${list.length})`;
        } else {
          el.textContent = String(list.length);
        }
      });
    };

    const filterUsers = () => {
      const keyword = normalizeText(state.keyword);
      const filtered = cachedUsers.filter((user) => {
        if (keyword) {
          const haystack = normalizeText(
            `${user.full_name || ""} ${user.username || ""} ${user.email || ""} ${user.phone || ""}`
          );
          if (!haystack.includes(keyword)) {
            return false;
          }
        }
        if (state.role !== "all") {
          const hasRole = (user.roles || []).some((role) => getRoleSlug(role) === state.role);
          if (!hasRole) return false;
        }
        if (state.dept !== "all") {
          if (getDepartmentSlug(user) !== state.dept) {
            return false;
          }
        }
        if (state.status !== "all") {
          const isActive = Boolean(user.is_active);
          if (state.status === "active" && !isActive) return false;
          if (state.status === "locked" && isActive) return false;
        }
        return true;
      });
      renderUsers(filtered);
    };

    const refreshFilterOptions = () => {
      const roleMap = new Map();
      cachedUsers.forEach((user) => {
        (user.roles || []).forEach((role) => {
          const slug = getRoleSlug(role);
          if (!slug) return;
          if (!roleMap.has(slug)) {
            roleMap.set(slug, getRoleLabel(role));
          }
        });
      });
      const roleSelector = document.querySelector("#filterRoleSelect") ? "#filterRoleSelect" : "#ddRole";
      updateDropdownEntries(
        roleSelector,
        "role",
        Array.from(roleMap.entries()).map(([slug, label]) => ({ slug, label }))
      );
      const deptMap = new Map();
      cachedUsers.forEach((user) => {
        const slug = getDepartmentSlug(user);
        if (!slug || slug === "unknown") return;
        if (!deptMap.has(slug)) {
          deptMap.set(slug, getDepartmentLabel(user));
        }
      });
      const deptSelector = document.querySelector("#filterDeptSelect") ? "#filterDeptSelect" : "#ddDept";
      updateDropdownEntries(
        deptSelector,
        "dept",
        Array.from(deptMap.entries()).map(([slug, label]) => ({ slug, label }))
      );
    };

    const updateKpis = (list) => {
      const users = Array.isArray(list) ? list : [];
      const total = users.length;
      const active = users.filter((user) => user.is_active).length;
      const cv = users.filter((user) => (user.roles || []).some((role) => getRoleSlug(role) === "cv")).length;
      const qt = users.filter((user) => (user.roles || []).some((role) => getRoleSlug(role) === "qt")).length;
      if (kpiTotal) animateValue(kpiTotal, total);
      if (kpiActive) animateValue(kpiActive, active);
      if (kpiCV) animateValue(kpiCV, cv);
      if (kpiQT) animateValue(kpiQT, qt);
    };

    const loadUsers = async () => {
      tableBody.innerHTML =
        '<tr><td colspan="8" class="px-4 py-6 text-center text-[13px] text-slate-500">Đang tải danh sách...</td></tr>';
      try {
        const response = api?.users?.list ? await api.users.list({ page_size: 200 }) : [];
        cachedUsers = extractItems(response);
        refreshFilterOptions();
        updateKpis(cachedUsers);
        filterUsers();
      } catch (error) {
        console.error("[quantri] loadUsers failed", error);
        tableBody.innerHTML = `<tr><td colspan=\"8\" class=\"px-4 py-6 text-center text-[13px] text-rose-500\">${resolveApiError(
          error
        )}</td></tr>`;
      }
    };

    const debouncedFilter = AdminRuntime.debounce(() => filterUsers(), 160);
    searchInput?.addEventListener("input", (event) => {
      state.keyword = normalizeText(event.target.value);
      debouncedFilter();
    });

    const roleSelect = document.getElementById("filterRoleSelect");
    const deptSelect = document.getElementById("filterDeptSelect");
    const statusSelect = document.getElementById("filterStatusSelect");

    const bindSelectFilter = (el, key) => {
      if (!el) return;
      el.addEventListener("change", () => {
        state[key] = el.value || "all";
        filterUsers();
      });
    };

    if (roleSelect || deptSelect || statusSelect) {
      bindSelectFilter(roleSelect, "role");
      bindSelectFilter(deptSelect, "dept");
      bindSelectFilter(statusSelect, "status");
    } else {
      setupFilterDropdown("filterRoleBtn", state, "role", applyFilters);
      setupFilterDropdown("filterDeptBtn", state, "dept", applyFilters);
      setupFilterDropdown("filterStatusBtn", state, "status", applyFilters);
    }

    tableBody.addEventListener("change", async (event) => {
      if (!event.target.matches("[data-user-status]")) return;
      const row = event.target.closest("tr");
      const userId = row?.dataset?.userId;
      if (!userId || !api?.users) return;
      const willActivate = Boolean(event.target.checked);
      event.target.disabled = true;
      try {
        if (willActivate) {
          await api.users.unlock(userId);
        } else {
          await api.users.lock(userId);
        }
        const user = cachedUsers.find((item) => item.user_id === userId);
        if (user) {
          user.is_active = willActivate;
        }
        const badge = row?.querySelector(".badge");
        if (badge) {
          badge.textContent = STATUS_LABELS[willActivate ? "active" : "locked"];
          badge.classList.toggle("badge--dark", willActivate);
          badge.classList.toggle("badge--muted", !willActivate);
        }
        AdminRuntime.toast(willActivate ? "Đã mở khóa tài khoản." : "Đã tạm khóa tài khoản.");
        updateKpis(cachedUsers);
        filterUsers();
      } catch (error) {
        AdminRuntime.toast(error?.message || "Không thể thay đổi trạng thái.");
        event.target.checked = !willActivate;
      } finally {
        event.target.disabled = false;
      }
    });

    tableBody.addEventListener("click", async (event) => {
      const editBtn = event.target.closest("[data-action='edit-user']");
      if (editBtn) {
        event.preventDefault();
        const row = editBtn.closest("tr");
        const userId = row?.dataset?.userId;
        const user = cachedUsers.find((item) => item.user_id === userId);
        if (user) {
          openUserForm("edit", user);
        }
        return;
      }
      const deleteBtn = event.target.closest("[data-action='delete-user']");
      if (deleteBtn) {
        event.preventDefault();
        const row = deleteBtn.closest("tr");
        const userId = row?.dataset?.userId || deleteBtn.dataset.userId;
        const name =
          deleteBtn.dataset.userName ||
          row?.querySelector(".font-medium")?.textContent?.trim() ||
          "tài khoản";
        if (!userId) {
          AdminRuntime.toast("Không xác định người dùng.", "error");
          return;
        }
        if (!api?.users?.delete) {
          AdminRuntime.toast("API xóa người dùng chưa sẵn sàng.", "error");
          return;
        }
        const confirmed = window.confirm(`Bạn có chắc muốn xoá ${name}?`);
        if (!confirmed) {
          return;
        }
        deleteBtn.disabled = true;
        try {
          await api.users.delete(userId);
          AdminRuntime.toast("Đã xoá người dùng.", "success");
          cachedUsers = cachedUsers.filter((item) => String(item.user_id) !== String(userId));
          updateKpis(cachedUsers);
          filterUsers();
        } catch (error) {
          console.error("[quantri] deleteUser failed", error);
          AdminRuntime.toast(resolveApiError(error), "error");
        } finally {
          deleteBtn.disabled = false;
        }
        return;
      }
      const btn = event.target.closest(".btn-icon");
      if (!btn || btn.tagName === "A") return;
      event.preventDefault();
      const row = btn.closest("tr");
      const name = row?.querySelector(".font-medium")?.textContent?.trim() || "tài khoản";
      AdminRuntime.toast(`Đang xử lý thao tác với ${name}.`);
    });

    userForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!api?.users) {
        AdminRuntime.toast("Không thể lưu người dùng lúc này.", "error");
        return;
      }
      const mode = userFormState.mode;
      const userId = userFormState.user?.user_id;
      const payload = {
        full_name: (userFullName?.value || "").trim(),
        username: (userUsername?.value || "").trim(),
        email: (userEmail?.value || "").trim(),
        phone: (userPhone?.value || "").trim(),
        user_code: (userCode?.value || "").trim(),
        is_active: Boolean(userActiveSwitch?.checked),
      };
      const deptValue = userDeptSelect?.value;
      if (deptValue) {
        payload.department_id = Number(deptValue) || null;
      } else {
        payload.department_id = null;
      }
      if (!payload.username || !payload.full_name) {
        userFormFeedback.textContent = "Vui lòng nhập tên và username.";
        return;
      }
      const roleIds = getSelectedRoleIds();
      if (mode === "create") {
        const passwordValue = (userPassword?.value || "").trim();
        if (!passwordValue) {
          userFormFeedback.textContent = "Vui lòng nhập mật khẩu.";
          return;
        }
        payload.password = passwordValue;
      }
      const submitBtn = userFormSubmit;
      const originalLabel = submitBtn?.textContent || "";
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = mode === "edit" ? "Đang cập nhật..." : "Đang tạo...";
      }
      try {
        let result;
        if (mode === "create") {
          result = await api.users.create(payload);
          if (roleIds.length && result?.user_id) {
            await api.users.assignRoles(result.user_id, roleIds);
          }
        } else {
          if (!userId) {
            throw new Error("Thiếu thông tin người dùng.");
          }
          result = await api.users.update(userId, payload);
          await api.users.assignRoles(userId, roleIds);
        }
        AdminRuntime.toast("Đã lưu người dùng.", "success");
        userFormModal?.close();
        clearUserForm();
        resetUserFormFeedback();
        loadUsers();
      } catch (error) {
        console.error("[quantri] saveUser failed", error);
        userFormFeedback.textContent = resolveApiError(error);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel;
        }
      }
    });

    loadUsers();
  }

  function setupFilterDropdown(buttonId, state, key, onChange) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    const menuSelector = btn.dataset.dropdown;
    const menu = menuSelector ? document.querySelector(menuSelector) : null;
    if (!menu) return;

    const labelEl = btn.querySelector(".btn-label");
    const selectItem = (item) => {
      const value = item.dataset[key] || "all";
      state[key] = value;
      if (labelEl) {
        labelEl.textContent = item.textContent.trim();
      }
      closeDropdown(menu);
      onChange?.();
    };

    btn.addEventListener("click", (event) => {
      event.preventDefault();
      toggleDropdown(btn);
    });

    menu.addEventListener("click", (event) => {
      const item = event.target.closest(".dropdown-item");
      if (!item) return;
      selectItem(item);
    });
  }

  function initNguoiDungDetail() {
    const userId = new URLSearchParams(window.location.search).get("id");
    if (userId && window.ApiClient && typeof initNguoiDungDetailApi === "function") {
      initNguoiDungDetailApi(userId);
    }
    const logPanel = $("#userLogPanel");
    if (logPanel) {
      $$('[data-expand-log]')
        .filter(Boolean)
        .forEach((btn) =>
          btn.addEventListener("click", () => {
            logPanel.classList.toggle("max-h-60");
            logPanel.classList.toggle("overflow-hidden");
            btn.textContent = logPanel.classList.contains("max-h-60") ? "Xem thêm" : "Thu gọn";
          })
        );
    }

    $$("[data-copy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.copy;
        navigator.clipboard?.writeText(value).then(() => AdminRuntime.toast("Đã sao chép."));
      });
    });

    const resetBtn = $("#btnResetPass");
    resetBtn?.addEventListener("click", () => {
      AdminRuntime.toast("Đã gửi yêu cầu đặt lại mật khẩu.");
    });

    const editBtn = $("#btnEditUser");
    editBtn?.addEventListener("click", () => {
      AdminRuntime.toast("Đi đến form chỉnh sửa người dùng.", "info");
      const backUrl = "nguoidung.html";
      if (backUrl) {
        window.location.href = backUrl;
      }
    });
  }

  function initNguoiDungDetailApi(userId) {
    const api = window.ApiClient || null;
    if (!api?.users || !userId) {
      return;
    }
    const avatarEl = $("#detailAvatar");
    const fullNameEl = $("#detailFullName");
    const roleLineEl = $("#detailRoleLine");
    const userCodeEl = $("#detailUserCode");
    const loginEl = $("#detailLogin");
    const emailEl = $("#detailEmail");
    const phoneEl = $("#detailPhone");
    const deptEl = $("#detailDepartment");
    const statusEl = $("#detailStatus");
    const createdEl = $("#detailCreatedAt");
    const lastLoginEl = $("#detailLastLogin");
    const breadcrumbEl = $("#detailBreadcrumb");
    const loginHistoryList = $("#loginHistoryList");
    const participationList = $("#userParticipationList");
    const auditList = $("#userAuditList");
    const rolesListEl = $("#userRolesList");
    const assignRolesBtn = $("#btnAssignRoles");
    const assignRolesModal = initModal("#assignRolesModal");
    const assignRolesForm = assignRolesModal?.form;
    const assignRolesList = $("#assignRolesList");
    const assignRolesCurrent = $("#assignRolesCurrent");
    const assignRolesFeedback = $("#assignRolesFeedback");
    let assignRolesCache = [];
    let detailUserData = null;
    let auditCache = [];
    const extractItems = (payload) => {
      if (api && typeof api.extractItems === "function") {
        return api.extractItems(payload);
      }
      if (Array.isArray(payload)) {
        return payload;
      }
      return payload?.items || [];
    };
    const setListPlaceholder = (el, text) => {
      if (!el) return;
      el.innerHTML = `<li class="rounded-lg border border-slate-100 p-3 text-[13px] text-slate-500">${escapeHtml(
        text
      )}</li>`;
    };
    const ensureAssignRolesCache = async () => {
      if (assignRolesCache.length) {
        return assignRolesCache;
      }
      assignRolesCache = await ensureAdminRoles();
      return assignRolesCache;
    };
    const updateAssignRolesSummary = () => {
      if (!assignRolesCurrent) return;
      const names = (detailUserData?.roles || []).map((role) => role.display_name || role.description || role.name || "Vai trò");
      assignRolesCurrent.textContent = names.length ? names.join(", ") : "Chưa có vai trò";
    };
    const renderAssignRoles = (selectedIds = new Set()) => {
      if (!assignRolesList) return;
      assignRolesList.innerHTML = assignRolesCache
        .map((role) => {
          const label = escapeHtml(role.display_name || role.description || role.name || "Vai trò");
          const description = escapeHtml(role.description || "");
          const checked = selectedIds.has(role.role_id) ? "checked" : "";
          return `<label class="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[13px] hover:bg-slate-50">
            <input type="checkbox" class="h-4 w-4 rounded border-slate-300 text-blue-600" value="${escapeHtml(
              role.role_id
            )}" ${checked} />
            <span class="text-slate-700">${label}</span>
            <span class="text-[11px] text-slate-400">${description}</span>
          </label>`;
        })
        .join("");
    };
    assignRolesBtn?.addEventListener("click", async () => {
      await ensureAssignRolesCache();
      const assignedIds = new Set((detailUserData?.roles || []).map((role) => role.role_id));
      renderAssignRoles(assignedIds);
      updateAssignRolesSummary();
      if (assignRolesFeedback) {
        assignRolesFeedback.textContent = "";
      }
      assignRolesModal?.open();
    });
    assignRolesForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!api?.users) {
        AdminRuntime.toast("Không thể gán vai trò lúc này.", "error");
        return;
      }
      const selectedIds = Array.from(
        assignRolesList?.querySelectorAll("input[type='checkbox']:checked") || []
      )
        .map((input) => Number(input.value))
        .filter((value) => Number.isFinite(value));
      try {
        await api.users.assignRoles(userId, selectedIds);
        AdminRuntime.toast("Đã cập nhật vai trò.", "success");
        if (detailUserData) {
          detailUserData.roles = assignRolesCache.filter((role) => selectedIds.includes(role.role_id));
          renderRolesList(detailUserData.roles);
          updateAssignRolesSummary();
        }
        assignRolesModal?.close();
      } catch (error) {
        console.error("[quantri] assignRoles failed", error);
        const message = resolveApiError(error);
        if (assignRolesFeedback) {
          assignRolesFeedback.textContent = message;
        }
      }
    });

    const renderLoginHistory = (entries = []) => {
      if (!loginHistoryList) return;
      if (!entries.length) {
        setListPlaceholder(loginHistoryList, "Chưa có lịch sử đăng nhập.");
        return;
      }
      loginHistoryList.innerHTML = entries
        .map((log) => {
          const time = formatDateTime(log.at || log.timestamp || log.created_at);
          const ip = log.ip || log.meta?.ip || "—";
          const agent =
            log.meta?.user_agent || log.user_agent || log.meta?.device || log.action || "Phiên đăng nhập";
          const status =
            log.action && /fail|error/i.test(log.action) ? "chip--amber" : "chip--green";
          const statusLabel =
            log.action && /fail|error/i.test(log.action) ? "Cảnh báo" : "Hợp lệ";
          return `<li class="rounded-lg border border-slate-100 p-3 flex items-center justify-between">
            <div>
              <div class="font-medium text-slate-700">${escapeHtml(time || "—")} • ${escapeHtml(agent)}</div>
              <div class="text-[12px] text-slate-500">IP: ${escapeHtml(ip)}</div>
            </div>
            <span class="chip ${status}">${statusLabel}</span>
          </li>`;
        })
        .join("");
    };

    const renderAuditLogs = (logs = []) => {
      if (!auditList) return;
      if (!logs.length) {
        setListPlaceholder(auditList, "Chưa có nhật ký hoạt động.");
        return;
      }
      auditList.innerHTML = logs
        .map((item) => {
          const time = formatDateTime(item.at);
          const ip = item.ip || "—";
          const action = item.action || "Hành động";
          const entity = item.entity_type || "Hệ thống";
          const desc = item.after_json || item.before_json || "";
          return `<li class="rounded-lg border border-slate-100 p-3">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-700">${escapeHtml(time || "—")} • ${escapeHtml(
            action
          )}</span>
              <span class="text-[12px] text-slate-500">IP: ${escapeHtml(ip)}</span>
            </div>
            <p class="mt-1 text-[12.5px] text-slate-600">Đối tượng: ${escapeHtml(entity || "—")}</p>
            <p class="mt-1 text-[12.5px] text-slate-500 line-clamp-2">${escapeHtml(desc || "")}</p>
          </li>`;
        })
        .join("");
    };

    const resolveTextValue = (value, fallback = "") => {
      if (value === undefined || value === null || value === "") {
        return fallback;
      }
      if (typeof value === "object") {
        return (
          value.name ||
          value.title ||
          value.case_status_name ||
          value.status_name ||
          value.code ||
          value.case_code ||
          value.label ||
          value.id ||
          (typeof value.toString === "function" ? value.toString() : fallback)
        );
      }
      return String(value);
    };

    const renderParticipation = (items = []) => {
      if (!participationList) return;
      if (!items.length) {
        setListPlaceholder(participationList, "Chưa ghi nhận hồ sơ/văn bản tham gia.");
        return;
      }
      participationList.innerHTML = items
        .map((entry) => {
          const code = resolveTextValue(
            entry.code || entry.case_code || entry.document_code || entry.case_id || entry.document_id,
            "Mã chưa có"
          );
          const title = resolveTextValue(entry.title || entry.name || entry.subject, "Hồ sơ/văn bản");
          const status = resolveTextValue(
            entry.status_name ||
              entry.status?.name ||
              entry.status?.code ||
              entry.status?.case_status_name ||
              entry.status?.status_name ||
              entry.status,
            "Đang xử lý"
          );
          const ownerId = entry.owner?.id || entry.owner_id || entry.owner?.user_id;
          const isOwner = ownerId && (userId && String(ownerId) === String(userId));
          const role = resolveTextValue(
            entry.role_on_case ||
              entry.role ||
              entry.position ||
              entry.participation_role ||
              (isOwner ? "Chủ sở hữu" : "Tham gia"),
            isOwner ? "Chủ sở hữu" : "Tham gia"
          );
          return `<li class="rounded-lg border border-slate-100 p-3">
            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium text-slate-700">${escapeHtml(code)} - ${escapeHtml(
                  title
                )}</div>
                <div class="text-[12px] text-slate-500">Vai tr?: ${escapeHtml(role)}</div>
              </div>
              <span class="chip chip--amber">${escapeHtml(status)}</span>
            </div>
          </li>`;
        })
        .join("");
    };
    const loadAuditLogs = async () => {
      if (!auditList) return;
      setListPlaceholder(auditList, "Đang tải nhật ký...");
      if (!api?.audit?.list) {
        setListPlaceholder(auditList, "API nhật ký chưa sẵn sàng.");
        return;
      }
      try {
        const response = await api.audit.list({ actor: userId, entity_id: userId, entity_type: "user", page_size: 20 });
        auditCache = extractItems(response);
        renderAuditLogs(auditCache);
      } catch (error) {
        console.error("[quantri] loadAuditLogs failed", error);
        setListPlaceholder(auditList, resolveApiError(error));
      }
    };

    const loadLoginHistory = async () => {
      if (!loginHistoryList) return;
      setListPlaceholder(loginHistoryList, "Đang tải lịch sử đăng nhập...");
      if (!api?.audit?.list) {
        setListPlaceholder(loginHistoryList, "API nhật ký chưa sẵn sàng.");
        return;
      }
      try {
        const response = await api.audit.list({ actor: userId, action: "LOGIN", page_size: 10 });
        const entries = extractItems(response);
        const derived =
          entries && entries.length
            ? entries
            : auditCache.filter((log) => /login|logout/i.test(log.action || ""));
        renderLoginHistory(derived.slice(0, 10));
      } catch (error) {
        console.error("[quantri] loadLoginHistory failed", error);
        setListPlaceholder(loginHistoryList, resolveApiError(error));
      }
    };

    const loadParticipation = async () => {
      if (!participationList) return;
      setListPlaceholder(participationList, "Đang tải danh sách tham gia...");
      if (!api?.cases?.list) {
        setListPlaceholder(participationList, "API hồ sơ chưa sẵn sàng.");
        return;
      }
      try {
        const response = await api.cases.list({ participant_id: userId, owner_id: userId, page_size: 5 });
        const entries = extractItems(response);
        renderParticipation(entries.slice(0, 5));
      } catch (error) {
        console.error("[quantri] loadParticipation failed", error);
        setListPlaceholder(participationList, resolveApiError(error));
      }
    };

    const ROLE_PALETTE = {
      qt: "chip--rose",
      vt: "chip--amber",
      cv: "chip--green",
      ld: "chip--purple",
    };
    const slugifyRole = (value) =>
      (value || "")
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    const setText = (element, value, fallback = "—") => {
      if (!element) return;
      element.textContent = (value || value === 0 ? String(value) : fallback);
    };
    const formatRoleDisplay = (role) => role?.display_name || role?.description || role?.name || "Vai trò";
    const computeInitials = (value, fallback) => {
      const tokens =
        (value || "")
          .toString()
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .slice(-2)
          .map((token) => token[0]?.toUpperCase())
          .join("") || "";
      if (tokens) return tokens;
      if (fallback) {
        return fallback.toString().slice(0, 2).toUpperCase();
      }
      return "";
    };
    const renderRolesList = (roles = []) => {
      if (!rolesListEl) return;
      if (!roles.length) {
        rolesListEl.innerHTML =
          '<li class="rounded-lg border border-slate-100 p-3 text-[13px] text-slate-500">Chưa có vai trò nào được gán.</li>';
        return;
      }
      rolesListEl.innerHTML = roles
        .map((role) => {
          const name = formatRoleDisplay(role);
          const permissionNames = (role?.permissions || [])
            .map((perm) => perm?.name || perm?.code)
            .filter(Boolean);
          const permissionsLabel = permissionNames.length
            ? permissionNames.slice(0, 4).join(", ")
            : "Chưa có quyền nào";
          const slug = slugifyRole(role?.name || role?.description || name);
          const badgeClass = ROLE_PALETTE[slug] || "chip";
          return `<li class="rounded-lg border border-slate-100 p-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="font-medium text-slate-700">${escapeHtml(name)}</div>
                <div class="text-[12px] text-slate-500 line-clamp-2">${escapeHtml(permissionsLabel)}</div>
              </div>
              <span class="chip ${badgeClass}">${escapeHtml(name)}</span>
            </div>
          </li>`;
        })
        .join("");
    };
    const updateStatus = (isActive) => {
      if (!statusEl) return;
      statusEl.textContent = isActive ? "Đang hoạt động" : "Tạm khóa";
      statusEl.classList.toggle("text-emerald-600", Boolean(isActive));
      statusEl.classList.toggle("text-rose-600", !isActive);
    };
    const showError = (message) => {
      const text = message || "Không thể tải dữ liệu người dùng.";
      setText(fullNameEl, "Không xác định");
      setText(roleLineEl, text);
      setText(userCodeEl, "—");
      setText(loginEl, "—");
      setText(emailEl, "—");
      setText(phoneEl, "—");
      setText(deptEl, "—");
      updateStatus(false);
      setText(createdEl, "—");
      setText(lastLoginEl, "—");
      if (avatarEl) {
        avatarEl.textContent = "?";
      }
      if (rolesListEl) {
        rolesListEl.innerHTML = `<li class="rounded-lg border border-slate-100 p-3 text-[13px] text-rose-600">${escapeHtml(
          text
        )}</li>`;
      }
      if (statusEl) {
        statusEl.textContent = text;
      }
    };
    const load = async () => {
      try {
        const user = await api.users.retrieve(userId);
        if (!user) {
          showError("Không tìm thấy người dùng.");
          return;
        }
        const fullName = user.full_name || user.username || "Người dùng";
        const username = user.username || "";
        setText(fullNameEl, fullName);
        const roleNames = (user.roles || [])
          .map((role) => formatRoleDisplay(role))
          .filter(Boolean);
        const deptName = user.department?.name;
        const lineParts = [];
        if (roleNames.length) {
          lineParts.push(roleNames.join(" • "));
        }
        if (deptName) {
          lineParts.push(deptName);
        }
        const lineText = lineParts.join(" • ");
        setText(roleLineEl, lineText, deptName || "Chưa có thông tin vai trò/phòng ban");
        setText(userCodeEl, user.user_code, "—");
        setText(loginEl, username ? `@${username}` : "—");
        setText(emailEl, user.email);
        setText(phoneEl, user.phone);
        setText(deptEl, deptName, "Chưa phân phòng");
        updateStatus(user.is_active);
        setText(createdEl, formatDateTime(user.created_at), "—");
        setText(lastLoginEl, user.last_login ? formatDateTime(user.last_login) : "Chưa đăng nhập");
        if (breadcrumbEl) {
          breadcrumbEl.textContent = `${user.user_code || user.user_id || "—"} • Chi tiết người dùng`;
        }
        if (avatarEl) {
          avatarEl.textContent = computeInitials(user.full_name, user.username);
        }
        detailUserData = user;
        renderRolesList(user.roles || []);
        updateAssignRolesSummary();
        loadAuditLogs();
        loadLoginHistory();
        loadParticipation();
      } catch (error) {
        console.error("[quantri] initNguoiDungDetailApi failed", error);
        showError(resolveApiError(error));
      }
    };
    load();
  }

  /* --------------------------- Phân quyền --------------------------- */
  function initPhanQuyen() {
    if (window.ApiClient && typeof initPhanQuyenApi === "function") {
      initPhanQuyenApi();
    }
    const tabs = $$('.tab-btn[data-tab]');
    if (tabs.length) {
      tabs.forEach((btn) =>
        btn.addEventListener("click", () => {
          tabs.forEach((b) => b.classList.toggle("is-active", b === btn));
          const target = btn.dataset.tab;
          $$('[id^="tab-"]', doc).forEach((panel) => {
            const id = panel.id.replace('tab-', '');
            panel.classList.toggle("hidden", panel.id !== `tab-${target}`);
          });
        })
      );
      tabs[0].click();
    }

    $$(".perm-checkall").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const col = checkbox.dataset.col;
        $$("#perm-table input[data-perm='" + col + "']").forEach((input) => {
          input.checked = checkbox.checked;
        });
      });
    });

    const search = $("#userperm-search");
    if (search) {
      const targetTable = $("#userperm-table");
      const applySearch = () => {
        const needle = normalizeText(search.value);
        const rows = targetTable ? $$('tr', targetTable) : [];
        let visible = 0;
        rows.forEach((row) => {
          const hit = !needle || normalizeText(row.textContent).includes(needle);
          row.classList.toggle("hidden", !hit);
          if (hit) visible++;
        });
        const counter = $("[data-userperm-count]");
        if (counter) counter.textContent = `${visible} người dùng`;
      };
      search.addEventListener("input", AdminRuntime.debounce(applySearch, 120));
      applySearch();
    }
  }

  /* --------------------------- Danh mục hệ thống --------------------------- */
  function initPhanQuyenApi() {
    const api = window.ApiClient || null;
    if (!api) return;
    const extractItems = (payload) => {
      if (api && typeof api.extractItems === "function") {
        return api.extractItems(payload);
      }
      if (Array.isArray(payload)) {
        return payload;
      }
      return payload?.items || [];
    };
    const extractMeta = (payload) => {
      if (api && typeof api.extractPageMeta === "function") {
        return api.extractPageMeta(payload);
      }
      return {
        totalItems: Array.isArray(payload) ? payload.length : payload?.count || payload?.total_items || 0,
      };
    };
    const roleBody = $("#role-table-body");
    const permBody = $("#permission-table-body");
    const detailBody = $("#role-perm-table-body");
    const matrixBody = $("#perm-table");
    const roleSelect = $("#role-select");
    const kpiRoles = $("#kpi-roles");
    const kpiUsers = $("#kpi-users");
    const kpiGroups = $("#kpi-groups");
    const kpiModules = $("#kpi-modules");
    const roleCountBadge = $("#roleCountBadge");
    const createGroupBtn = $("#btn-create-group");
    const assignPermissionsModal = initModal("#assignPermissionsModal");
    const assignPermissionsForm = assignPermissionsModal?.form;
    const assignPermissionsList = $("#assignPermissionsList");
    const assignPermissionsRoleName = $("#assignPermissionsRoleName");
    const assignPermissionsSearch = $("#assignPermissionsSearch");
    const assignPermissionsFeedback = $("#assignPermissionsFeedback");
    const userTableBody = $("#userperm-table");
    const userCountEl = document.querySelector("[data-userperm-count]");
    let permissionCache = [];
    let loadedRoles = [];
    let loadedUsers = [];
    let userRoleCount = new Map();
    let activeRoleForModal = null;
    const matrixColumns = ["view", "create", "edit", "delete", "approve", "archive", "export", "send", "config", "backup"];

    const formatRoleDisplay = (role) => escapeHtml(role.display_name || role.description || role.name || "Vai trò");

    const updateKpis = () => {
      if (kpiRoles) kpiRoles.textContent = String(loadedRoles.length || 0);
      const userTotal = loadedUsers.length || 0;
      if (kpiUsers) kpiUsers.textContent = String(userTotal);
      if (userCountEl) userCountEl.textContent = `${userTotal} người dùng`;
      const domains = new Set();
      permissionCache.forEach((perm) => {
        const code = (perm.code || "").toString();
        domains.add(code.split(".")[0] || code || "khac");
      });
      if (kpiGroups) kpiGroups.textContent = String(domains.size || 0);
      if (kpiModules) kpiModules.textContent = String(permissionCache.length || 0);
    };

    const populateRoleSelect = (roles) => {
      if (!roleSelect) return;
      roleSelect.innerHTML = roles
        .map(
          (role) =>
            `<option value="${escapeHtml(role.role_id)}">${escapeHtml(role.display_name || role.description || role.name || "Vai trò")}</option>`
        )
        .join("");
      roleSelect.addEventListener("change", () => {
        renderMatrixForRole(roleSelect.value);
      });
      if (roles.length) {
        roleSelect.value = roles[0].role_id;
        renderMatrixForRole(roleSelect.value);
      }
    };

    const renderMatrixForRole = (roleId) => {
      if (!matrixBody) return;
      const role = loadedRoles.find((r) => String(r.role_id) === String(roleId));
      const permissions = role?.permissions || [];
      if (!permissions.length) {
        matrixBody.innerHTML =
          '<tr><td colspan="11" class="px-4 py-6 text-center text-[13px] text-slate-500">Vai trò chưa có quyền nào.</td></tr>';
        return;
      }
      matrixBody.innerHTML = permissions
        .map((perm) => {
          const title = perm.name || perm.code || "Quyền";
          const desc = perm.description || "";
          const columns = new Set(
            (perm.columns || []).map((value) => String(value || "").toLowerCase())
          );
          const columnCells = matrixColumns
            .map((col) => {
              const checked = columns.has(col);
              return `<td class="px-4 py-3 text-center">
                <input
                  type="checkbox"
                  class="cursor-not-allowed"
                  ${checked ? "checked" : ""}
                  disabled
                />
              </td>`;
            })
            .join("");
          return `<tr class="hover:bg-slate-50/60">
            <td class="px-4 py-3">
              <div class="text-[11px] font-semibold uppercase tracking-wide text-blue-600">${escapeHtml(
                perm.code || ""
              )}</div>
              <div class="font-medium mt-0.5">${escapeHtml(title)}</div>
              <div class="text-[12px] text-slate-500">${escapeHtml(desc || "Quyền hệ thống")}</div>
            </td>
            ${columnCells}
          </tr>`;
        })
        .join("");
    };

    const renderRoleTable = (roles) => {
      if (!roleBody) return;
      if (!roles.length) {
        roleBody.innerHTML =
          '<tr><td colspan="6" class="px-4 py-6 text-center text-[13px] text-slate-500">Chưa có vai trò nào.</td></tr>';
        if (roleCountBadge) {
          roleCountBadge.textContent = "0 vai trò hoạt động";
        }
        return;
      }
      roleBody.innerHTML = roles
        .map((role) => {
          const permissions = role.permissions || [];
          const permissionChips = permissions
            .slice(0, 3)
            .map((perm) => `<span class="chip chip--green">${escapeHtml(perm.code || perm.name)}</span>`)
            .join("");
          const userCount = userRoleCount.get(role.role_id) || 0;
          return `<tr class="hover:bg-slate-50/60">
            <td class="px-4 py-3 font-medium text-slate-700">${formatRoleDisplay(role)}</td>
            <td class="px-4 py-3">${formatRoleDisplay(role)}</td>
            <td class="px-4 py-3">${escapeHtml(role.description || "Chưa có mô tả")}</td>
            <td class="px-4 py-3">${userCount}</td>
            <td class="px-4 py-3 space-x-1">${permissionChips}</td>
            <td class="px-4 py-3">
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="h-8 rounded-lg border border-slate-200 px-3 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
                  data-action="assign-role"
                  data-role-id="${escapeHtml(role.role_id)}"
                  data-role-name="${formatRoleDisplay(role)}"
                >
                  Phân quyền
                </button>
              </div>
            </td>
          </tr>`;
        })
        .join("");
      if (roleCountBadge) {
        roleCountBadge.textContent = `${roles.length} vai trò hoạt động`;
      }
    };

    const renderPermissions = (permissions, permToRoles) => {
      if (!permBody) return;
      if (!permissions.length) {
        permBody.innerHTML =
          '<tr><td colspan="5" class="px-4 py-6 text-center text-[13px] text-slate-500">Chưa có quyền nào.</td></tr>';
        return;
      }
      permBody.innerHTML = permissions
        .map((perm) => {
          const domain = (perm.code || "").split(".")[0] || "Chung";
          const roles = permToRoles.get(perm.permission_id) || [];
          const rolesLabel = roles
            .slice(0, 3)
            .map((role) => formatRoleDisplay(role))
            .join(", ");
          return `<tr class="hover:bg-slate-50/60">
            <td class="px-4 py-3 font-medium text-slate-700">${escapeHtml(perm.code)}</td>
            <td class="px-4 py-3">${escapeHtml(perm.name)}</td>
            <td class="px-4 py-3">${escapeHtml(perm.description || "-")}</td>
            <td class="px-4 py-3">${escapeHtml(domain)}</td>
            <td class="px-4 py-3"><span class="chip chip--green">${escapeHtml(rolesLabel || "Chưa gán")}</span></td>
          </tr>`;
        })
          .join("");
    };

    const renderAssignPermissions = (selectedIds = new Set()) => {
      if (!assignPermissionsList) return;
      assignPermissionsList.innerHTML = permissionCache
        .map((perm) => {
          const label = escapeHtml(perm.name || perm.code || "Quyền");
          const code = escapeHtml(perm.code || "?");
          const normalizedLabel = normalizeText(`${perm.code || ""} ${perm.name || ""}`);
          const isChecked = selectedIds.has(perm.permission_id) ? "checked" : "";
          return `<label
            class="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[13px] hover:bg-slate-50"
            data-permission-label="${normalizedLabel}"
          >
            <input
              type="checkbox"
              class="h-4 w-4 rounded border-slate-300 text-blue-600"
              value="${escapeHtml(perm.permission_id)}"
              ${isChecked}
            />
            <div>
              <div class="font-medium text-slate-700">${code}</div>
              <div class="text-[11px] text-slate-500">${label}</div>
            </div>
          </label>`;
        })
        .join("");
      filterAssignPermissions();
    };

    const filterAssignPermissions = () => {
      const query = normalizeText(assignPermissionsSearch?.value);
      assignPermissionsList
        ?.querySelectorAll("[data-permission-label]")
        ?.forEach((row) => {
          const label = row.dataset.permissionLabel || "";
          row.classList.toggle("hidden", Boolean(query) && !label.includes(query));
        });
    };

    assignPermissionsSearch?.addEventListener("input", () => {
      filterAssignPermissions();
    });


    const renderRolePermTable = (roles) => {
      if (!detailBody) return;
      const rows = [];
      roles.forEach((role) => {
        (role.permissions || []).forEach((perm) => {
          rows.push(`<tr class="hover:bg-slate-50/60">
            <td class="px-4 py-3 font-medium text-slate-700">${formatRoleDisplay(role)}</td>
            <td class="px-4 py-3 text-blue-600">${escapeHtml(perm.code)}</td>
            <td class="px-4 py-3">${escapeHtml(perm.name)}</td>
            <td class="px-4 py-3 text-slate-500">${escapeHtml(role.description || "Phạm vi nội bộ")}</td>
          </tr>`);
        });
      });
      detailBody.innerHTML = rows.length
        ? rows.join("")
        : '<tr><td colspan="4" class="px-4 py-6 text-center text-[13px] text-slate-500">Chưa có phân quyền chi tiết.</td></tr>';
    };

    const loadRoleData = async () => {
      try {
        const roleResponse = await api.roles.list({ page_size: 200 });
        const roles = extractItems(roleResponse);
        loadedRoles = roles;
        populateRoleSelect(roles);
        renderRoleTable(roles);
        renderRolePermTable(roles);
        const permissionsResponse = await api.permissions.list({ page_size: 400 });
        const permissions = extractItems(permissionsResponse);
        permissionCache = permissions;
        const permToRoles = new Map();
        roles.forEach((role) => {
          (role.permissions || []).forEach((perm) => {
            const list = permToRoles.get(perm.permission_id) || [];
            list.push(role);
            permToRoles.set(perm.permission_id, list);
          });
        });
        renderPermissions(permissions, permToRoles);
        updateKpis();
      } catch (error) {
        console.error("[quantri] initPhanQuyenApi failed", error);
        const message = resolveApiError(error);
        if (roleBody) {
          roleBody.innerHTML = `<tr><td colspan="6" class="px-4 py-6 text-center text-[13px] text-rose-600">${message}</td></tr>`;
        }
        if (permBody) {
          permBody.innerHTML = `<tr><td colspan="5" class="px-4 py-6 text-center text-[13px] text-rose-600">${message}</td></tr>`;
        }
        if (detailBody) {
          detailBody.innerHTML = `<tr><td colspan="4" class="px-4 py-6 text-center text-[13px] text-rose-600">${message}</td></tr>`;
        }
      }
    };

    const openAssignPermissionsModal = (role) => {
      if (!role) return;
      activeRoleForModal = role;
      if (assignPermissionsRoleName) {
        assignPermissionsRoleName.textContent = formatRoleDisplay(role);
      }
      const selectedIds = new Set((role.permissions || []).map((perm) => perm.permission_id));
      renderAssignPermissions(selectedIds);
      assignPermissionsFeedback && (assignPermissionsFeedback.textContent = "");
      assignPermissionsModal?.open();
    };

    roleBody?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action='assign-role']");
      if (!button) return;
      event.preventDefault();
      const roleId = button.dataset.roleId;
      const role = loadedRoles.find((item) => String(item.role_id) === roleId);
      if (!role) return;
      openAssignPermissionsModal(role);
    });

    assignPermissionsForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!api?.roles || !activeRoleForModal) {
        return;
      }
      const selectedIds = Array.from(
        assignPermissionsList?.querySelectorAll("input[type='checkbox']:checked") || []
      )
        .map((input) => Number(input.value))
        .filter((value) => Number.isFinite(value));
      try {
        await api.roles.assignPermissions(activeRoleForModal.role_id, selectedIds);
        AdminRuntime.toast("Đã cập nhật quyền cho vai trò.", "success");
        assignPermissionsModal?.close();
        await loadRoleData();
      } catch (error) {
        console.error("[quantri] assignPermissions failed", error);
        if (assignPermissionsFeedback) {
          assignPermissionsFeedback.textContent = resolveApiError(error);
        }
      }
    });

    const renderUserTable = (users) => {
      if (!userTableBody) return;
      if (!users.length) {
        userTableBody.innerHTML =
          '<tr><td colspan="6" class="px-4 py-6 text-center text-[13px] text-slate-500">Chưa có người dùng.</td></tr>';
        return;
      }
      userTableBody.innerHTML = users
        .map((user) => {
          const roles = user.roles || [];
          const roleBadges = roles
            .map((role) => `<span class="chip chip--green">${escapeHtml(role.display_name || role.description || "")}</span>`)
            .join(" ");
          const statusBadge = user.is_active
            ? '<span class="badge badge--green">Hoạt động</span>'
            : '<span class="badge badge--red">Khóa</span>';
          const lastLogin = user.last_login ? formatDateTime(user.last_login) : "Chưa đăng nhập";
          return `<tr class="hover:bg-slate-50/60">
            <td class="px-4 py-3">
              <div class="font-medium">${escapeHtml(user.full_name || user.username || "Người dùng")}</div>
              <div class="text-[12.5px] text-slate-500">Tài khoản: @${escapeHtml(user.username || "")}</div>
              <div class="text-[12.5px] text-slate-500">Mã cán bộ: ${escapeHtml(user.user_code || "N/A")}</div>
              <div class="text-[12px] text-slate-500">Thư điện tử: ${escapeHtml(user.email || "-")}</div>
            </td>
            <td class="px-4 py-3 space-x-1">${roleBadges || '<span class="chip">Chưa gán vai trò</span>'}</td>
            <td class="px-4 py-3">${escapeHtml(user.department_name || "Chưa cập nhật")}</td>
            <td class="px-4 py-3">
              <div class="flex flex-col gap-1">
                ${statusBadge}
              </div>
            </td>
            <td class="px-4 py-3 text-slate-600">${escapeHtml(lastLogin)}</td>
            <td class="px-4 py-3">
              <button class="h-9 rounded-lg border border-slate-200 px-3 text-[13px] hover:bg-slate-50">Xem</button>
            </td>
          </tr>`;
        })
        .join("");
      document.getElementById("userperm-search")?.dispatchEvent(new Event("input"));
    };

    const loadUsers = async () => {
      if (!api?.users) return;
      try {
        const response = await api.users.list({ page_size: 400 });
        loadedUsers = extractItems(response);
        userRoleCount = new Map();
        loadedUsers.forEach((user) => {
          (user.roles || []).forEach((role) => {
            const current = userRoleCount.get(role.role_id) || 0;
            userRoleCount.set(role.role_id, current + 1);
          });
        });
        renderUserTable(loadedUsers);
        renderRoleTable(loadedRoles);
        updateKpis(extractMeta(response));
      } catch (error) {
        console.error("[quantri] loadUsers failed", error);
        if (userTableBody) {
          userTableBody.innerHTML = `<tr><td colspan="6" class="px-4 py-6 text-center text-[13px] text-rose-600">${resolveApiError(
            error
          )}</td></tr>`;
        }
      }
    };

    const handleCreateRole = async () => {
      if (!api?.roles?.create) {
        AdminRuntime.toast("API vai trò chưa sẵn sàng.", "error");
        return;
      }
      const name = window.prompt("Nhập tên vai trò/nhóm quyền:");
      if (name === null) return;
      const trimmed = name.trim();
      if (!trimmed) {
        AdminRuntime.toast("Tên vai trò không được để trống.", "error");
        return;
      }
      const description = window.prompt("Mô tả (tuỳ chọn):", "");
      try {
        await api.roles.create({
          name: trimmed,
          description: description ? description.trim() : undefined,
        });
        AdminRuntime.toast("Đã tạo vai trò mới.", "success");
        await loadRoleData();
      } catch (error) {
        console.error("[quantri] createRole failed", error);
        AdminRuntime.toast(resolveApiError(error), "error");
      }
    };

    createGroupBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      handleCreateRole();
    });

    loadRoleData();
    loadUsers();
  }

  function initDanhMuc() {
    if (window.ApiClient && typeof initDanhMucApi === "function") {
      initDanhMucApi();
    }
    loadDanhMucSummary();
    const tabButtons = $$('.seg-btn[data-tab]');
    if (!tabButtons.length) return;
    const searchInput = $("#dm-search");
    let activeTab = tabButtons.find((btn) => btn.classList.contains("is-active"))?.dataset.tab || tabButtons[0].dataset.tab;

    const showTab = (tabName) => {
      activeTab = tabName;
      tabButtons.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.tab === tabName));
      $$('[id^="tab-"]').forEach((panel) => {
        panel.classList.toggle("hidden", panel.id !== `tab-${tabName}`);
      });
      applySearch();
    };

    tabButtons.forEach((btn) => btn.addEventListener("click", () => showTab(btn.dataset.tab)));

    const applySearch = () => {
      if (!activeTab) return;
      const section = document.getElementById(`tab-${activeTab}`);
      if (!section) return;
      const keyword = normalizeText(searchInput?.value);
      const rows = $$('tbody tr', section);
      let visible = 0;
      rows.forEach((row) => {
        const hit = !keyword || normalizeText(row.textContent).includes(keyword);
        row.classList.toggle("hidden", !hit);
        if (hit) visible++;
      });
      const emptyNote = section.querySelector("[data-empty]");
      if (emptyNote) emptyNote.classList.toggle("hidden", Boolean(visible));
    };

    searchInput?.addEventListener("input", AdminRuntime.debounce(applySearch, 160));
    showTab(activeTab);
    loadRegisterBooks();
    loadNumberingSummary();
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = value;
    }
  }

  async function loadDanhMucSummary() {
    const api = window.ApiClient;
    const setDash = (id) => setText(id, "-");
    if (!api) {
      ["kpi-doc-types", "kpi-doc-statuses", "kpi-priorities", "kpi-departments", "kpi-agencies"].forEach(
        setDash
      );
      return;
    }

    const getCount = (response) => {
      if (api.extractPageMeta) {
        const meta = api.extractPageMeta(response);
        if (meta?.count != null) return meta.count;
      }
      const items = api.extractItems ? api.extractItems(response) : [];
      return Array.isArray(items) ? items.length : 0;
    };

    const tasks = [
      { id: "kpi-doc-types", fn: () => api.catalog?.list("document-types", { page_size: 1 }) },
      { id: "kpi-doc-statuses", fn: () => api.catalog?.list("document-statuses", { page_size: 1 }) },
      { id: "kpi-priorities", fn: () => api.catalog?.list("urgency-levels", { page_size: 1 }) },
      { id: "kpi-departments", fn: () => api.departments?.list({ page_size: 1 }) },
      { id: "kpi-agencies", fn: () => api.organizations?.list({ page_size: 1 }) },
    ];

    tasks.forEach(({ id }) => setText(id, "…"));

    await Promise.all(
      tasks.map(async ({ id, fn }) => {
        try {
          const response = typeof fn === "function" ? await fn() : null;
          if (!response) throw new Error("API not ready");
          setText(id, formatNumber(getCount(response)));
        } catch (error) {
          console.warn(`[danhmuc] load KPI ${id} failed`, error);
          setDash(id);
        }
      })
    );
  }

  /* --------------------------- Cấu hình nâng cao --------------------------- */
  function initDanhMucApi() {
    const api = window.ApiClient || null;
    if (!api) return;
    const extractItems = (payload) => {
      if (api && typeof api.extractItems === "function") {
        return api.extractItems(payload);
      }
      if (Array.isArray(payload)) {
        return payload;
      }
      return payload?.items || [];
    };

    const tbody = $("#tb-departments");
    const btnAdd = $("#btn-add-dept");

    const createRow = (dept) => {
      const lead = dept.lead_user?.full_name || dept.lead_user?.username || "Chưa có";
      const contact = dept.address
        ? `<div class="text-[12.5px] text-slate-600">${escapeHtml(dept.address)}</div>`
        : '<div class="text-[12.5px] text-slate-600">Chưa có liên hệ</div>';
      return `<tr class="hover:bg-slate-50/60">
        <td class="px-4 py-3 font-mono text-[12px] text-slate-600">${escapeHtml(
          dept.department_code || `PB-${dept.department_id}`
        )}</td>
        <td class="px-4 py-3">${escapeHtml(dept.name || "Phòng ban chưa đặt tên")}</td>
        <td class="px-4 py-3">${escapeHtml(lead)}</td>
        <td class="px-4 py-3 text-[12.5px]">${contact}</td>
        <td class="px-4 py-3 text-slate-500">${formatDateTime(dept.created_at)}</td>
        <td class="px-4 py-3">
          <div class="flex items-center gap-2">
            <button class="w-8 h-8 grid place-items-center rounded-full hover:bg-slate-100">👁</button>
            <button class="w-8 h-8 grid place-items-center rounded-full hover:bg-emerald-50 text-emerald-600">✔</button>
            <button class="w-8 h-8 grid place-items-center rounded-full hover:bg-rose-50 text-rose-600">🗂</button>
          </div>
        </td>
      </tr>`;
    };

    const renderDepartments = (depts) => {
      if (!tbody) return;
      if (!depts.length) {
        tbody.innerHTML =
          '<tr><td colspan="6" class="px-4 py-6 text-center text-[13px] text-slate-500">Chưa có phòng ban.</td></tr>';
        return;
      }
      tbody.innerHTML = depts.map(createRow).join("");
    };

    const loadDepartments = async () => {
      if (!tbody) return;
      if (!api.departments) {
        tbody.innerHTML =
          '<tr><td colspan="6" class="px-4 py-6 text-center text-[13px] text-rose-500">API phòng ban chưa được cấu hình.</td></tr>';
        return;
      }
      tbody.innerHTML =
        '<tr><td colspan="6" class="px-4 py-6 text-center text-[13px] text-slate-500">Đang tải phòng ban...</td></tr>';
      try {
        const response = await api.departments.list({ page_size: 200 });
        const departments = extractItems(response);
        renderDepartments(departments);
      } catch (error) {
        console.error("[quantri] initDanhMucApi failed", error);
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-6 text-center text-[13px] text-rose-600">${resolveApiError(
          error
        )}</td></tr>`;
      }
    };

    btnAdd?.addEventListener("click", () => {
      AdminRuntime.toast("Tính năng thêm phòng ban sẽ sớm kết nối API.");
    });

    loadDepartments();

    const agenciesBody = document.querySelector("[data-organization-body='agencies']");
    const agencyAddButton = document.querySelector("[data-organization-add='agencies']");
    const organizationApi = api?.organizations;

    const getTableColumnCount = (body) => {
      const table = body?.closest("table");
      if (!table) return 1;
      const headerCount = table.querySelectorAll("thead th").length;
      return Math.max(headerCount, 1);
    };

    const showAgencyMessage = (text) => {
      if (!agenciesBody) return;
      const columns = getTableColumnCount(agenciesBody);
      agenciesBody.innerHTML = `<tr><td colspan="${columns}" class="px-4 py-6 text-center text-[13px] text-slate-500">${escapeHtml(
        text
      )}</td></tr>`;
    };

    const buildAgencyRow = (item) => {
      const columns = getTableColumnCount(agenciesBody);
      const classification = item.tax_code || item.phone || "—";
      const description = item.address || item.email || "—";
      const status = item.is_active ? "Hoạt động" : "Đã khóa";
      return `<tr
        class="hover:bg-slate-50/60"
        data-organization-row
        data-organization-id="${encodeURIComponent(item.organization_id)}"
        data-organization-name="${escapeHtml(item.name || "")}"
        data-organization-address="${escapeHtml(item.address || "")}"
      >
        <td class="px-4 py-3 text-slate-900">${escapeHtml(item.name || "")}</td>
        <td class="px-4 py-3 text-slate-600">${escapeHtml(description)}</td>
        <td class="px-4 py-3 text-slate-600">${escapeHtml(classification)}</td>
        <td class="px-4 py-3">
          <span class="badge badge--dark">${escapeHtml(status)}</span>
        </td>
        <td class="px-4 py-3">
          <div class="flex items-center gap-2">
            <button
              type="button"
              data-organization-action="view"
              class="w-8 h-8 grid place-items-center rounded-full hover:bg-slate-100"
              title="Xem"
            >
              👁
            </button>
            <button
              type="button"
              data-organization-action="edit"
              class="w-8 h-8 grid place-items-center rounded-full hover:bg-emerald-50 text-emerald-600"
              title="Sửa"
            >
              ✔
            </button>
            <button
              type="button"
              data-organization-action="delete"
              class="w-8 h-8 grid place-items-center rounded-full hover:bg-rose-50 text-rose-600"
              title="Xóa"
            >
              🗂
            </button>
          </div>
        </td>
      </tr>`;
    };

    const loadAgencies = async () => {
      if (!agenciesBody) return;
      if (!organizationApi) {
        showAgencyMessage("API cơ quan chưa được cấu hình.");
        return;
      }
      showAgencyMessage("Đang tải cơ quan từ API...");
      try {
        const response = await organizationApi.list({ page_size: 200 });
        const agencies = api.extractItems(response);
        if (!agencies.length) {
          showAgencyMessage("Chưa có cơ quan nào trong hệ thống.");
          return;
        }
        agenciesBody.innerHTML = agencies.map((item) => buildAgencyRow(item)).join("");
      } catch (error) {
        console.error("[quantri] loadAgencies failed", error);
        showAgencyMessage(resolveApiError(error));
      }
    };

    const handleOrganizationAdd = async () => {
      if (!organizationApi) {
        AdminRuntime.toast("API cơ quan chưa được cấu hình.", "error");
        return;
      }
      const name = window.prompt("Nhập tên cơ quan:");
      if (name === null) return;
      const trimmed = name.trim();
      if (!trimmed) {
        AdminRuntime.toast("Tên cơ quan không được để trống.", "error");
        return;
      }
      const address = window.prompt("Nhập địa chỉ (tuỳ chọn):", "");
      const phone = window.prompt("Nhập điện thoại (tuỳ chọn):", "");
      try {
        await organizationApi.create({
          name: trimmed,
          address: address ? address.trim() : undefined,
          phone: phone ? phone.trim() : undefined,
        });
        AdminRuntime.toast("Đã thêm cơ quan.", "success");
        loadAgencies();
      } catch (error) {
        AdminRuntime.toast(resolveApiError(error), "error");
      }
    };

    const handleOrganizationAction = async (action, row) => {
      if (!organizationApi || !row) return;
      const orgId = row.dataset.organizationId;
      const orgName = row.dataset.organizationName || "";
      const orgAddress = row.dataset.organizationAddress || "";
      const label = "cơ quan";
      if (!orgId) {
        AdminRuntime.toast("Không xác định cơ quan.", "error");
        return;
      }
      if (action === "view") {
        AdminRuntime.toast(`Chi tiết ${label} sẽ được bổ sung sau.`, "info");
        return;
      }
      if (action === "edit") {
        const name = window.prompt("Đổi tên cơ quan:", orgName);
        if (name === null) return;
        const trimmed = name.trim();
        if (!trimmed) {
          AdminRuntime.toast("Tên cơ quan không được để trống.", "error");
          return;
        }
        const address = window.prompt("Địa chỉ (tuỳ chọn):", orgAddress);
        try {
          await organizationApi.update(orgId, {
            name: trimmed,
            address: address ? address.trim() : undefined,
          });
          AdminRuntime.toast("Đã cập nhật cơ quan.", "success");
          loadAgencies();
        } catch (error) {
          AdminRuntime.toast(resolveApiError(error), "error");
        }
        return;
      }
      if (action === "delete") {
        if (!window.confirm("Bạn có chắc muốn xóa cơ quan này?")) {
          return;
        }
        try {
          await organizationApi.delete(orgId);
          AdminRuntime.toast("Đã xóa cơ quan.", "success");
          loadAgencies();
        } catch (error) {
          AdminRuntime.toast(resolveApiError(error), "error");
        }
      }
    };

    agencyAddButton?.addEventListener("click", (event) => {
      event.preventDefault();
      handleOrganizationAdd();
    });

    document.addEventListener("click", (event) => {
      const actionBtn = event.target.closest("[data-organization-action]");
      if (!actionBtn) return;
      event.preventDefault();
      handleOrganizationAction(actionBtn.dataset.organizationAction, actionBtn.closest("[data-organization-row]"));
    });

    loadAgencies();

    const catalogLabels = {
      fields: "lĩnh vực",
      "document-types": "loại văn bản",
      "document-statuses": "trạng thái văn bản",
      "urgency-levels": "độ khẩn",
      "security-levels": "độ mật",
      "issue-levels": "mức phát hành",
      "case-types": "loại hồ sơ",
      "case-statuses": "trạng thái hồ sơ",
      "attachment-types": "loại tệp đính kèm",
    };

    const catalogBodies = Array.from(document.querySelectorAll("[data-catalog-body]"));
    const catalogMap = new Map();
    catalogBodies.forEach((body) => {
      const slug = body.dataset.catalogBody;
      if (slug) {
        catalogMap.set(slug, body);
      }
    });
    if (!catalogMap.size) return;

    const catalogApi = api.catalog;
    const getColumnCount = (body) => {
      const table = body?.closest("table");
      if (!table) return 1;
      const headerCount = table.querySelectorAll("thead th").length;
      return Math.max(headerCount, 1);
    };

    const showCatalogMessage = (body, text) => {
      const columns = getColumnCount(body);
      body.innerHTML = `<tr><td colspan="${columns}" class="px-4 py-6 text-center text-[13px] text-slate-500">${escapeHtml(
        text
      )}</td></tr>`;
    };

    const buildCatalogRow = (slug, item, columns) => {
      const idValue = item.id ?? item.pk ?? "";
      const idDisplay = idValue ? `#${slug}-${idValue}` : "—";
      const nameDisplay = item.name || "";
      const fillerCount = Math.max(columns - 3, 0);
      const fillerCell = '<td class="px-4 py-3 text-slate-500 text-sm text-center">—</td>';
      const actionCell = `
        <td class="px-4 py-3">
          <div class="flex items-center gap-2">
            <button
              type="button"
              data-catalog-action="view"
              class="w-8 h-8 grid place-items-center rounded-full hover:bg-slate-100"
              title="Xem"
            >
              👁
            </button>
            <button
              type="button"
              data-catalog-action="edit"
              class="w-8 h-8 grid place-items-center rounded-full hover:bg-emerald-50 text-emerald-600"
              title="Sửa"
            >
              ✔
            </button>
            <button
              type="button"
              data-catalog-action="delete"
              class="w-8 h-8 grid place-items-center rounded-full hover:bg-rose-50 text-rose-600"
              title="Xóa"
            >
              🗂
            </button>
          </div>
        </td>`;
      const fillerCells = Array(fillerCount).fill(fillerCell).join("");
      return `<tr
        class="hover:bg-slate-50/60"
        data-catalog-row
        data-catalog-slug="${escapeHtml(slug)}"
        data-catalog-id="${escapeHtml(idValue)}"
        data-catalog-name="${escapeHtml(nameDisplay)}"
      >
        <td class="px-4 py-3 font-mono text-[12px] text-slate-500">${escapeHtml(idDisplay)}</td>
        <td class="px-4 py-3 font-semibold text-slate-900">${escapeHtml(nameDisplay)}</td>
        ${fillerCells}
        ${actionCell}
      </tr>`;
    };

    const loadCatalog = async (slug) => {
      const body = catalogMap.get(slug);
      if (!body) return;
      const label = catalogLabels[slug] || slug;
      if (!catalogApi) {
        showCatalogMessage(body, `Danh mục ${label} chưa được kết nối API.`);
        return;
      }
      showCatalogMessage(body, `Đang tải ${label}...`);
      try {
        const response = await catalogApi.list(slug);
        const items = extractItems(response);
        if (!items.length) {
          showCatalogMessage(body, `Chưa có ${label}.`);
          return;
        }
        const columns = getColumnCount(body);
        body.innerHTML = items.map((item) => buildCatalogRow(slug, item, columns)).join("");
      } catch (error) {
        console.error(`[quantri] load catalog ${slug} failed`, error);
        showCatalogMessage(body, resolveApiError(error));
      }
    };

    async function handleCatalogAdd(slug) {
      if (!catalogMap.has(slug)) {
        AdminRuntime.toast("Danh mục không hợp lệ.", "error");
        return;
      }
      if (!catalogApi) {
        AdminRuntime.toast("Danh mục chưa được kết nối API.", "error");
        return;
      }
      const label = catalogLabels[slug] || slug;
      const raw = window.prompt(`Nhập tên ${label}`);
      if (raw === null) return;
      const name = raw.trim();
      if (!name) {
        AdminRuntime.toast("Tên không được để trống.", "error");
        return;
      }
      try {
        await catalogApi.create(slug, { name });
        AdminRuntime.toast(`Đã thêm ${label}.`, "success");
        await loadCatalog(slug);
      } catch (error) {
        AdminRuntime.toast(resolveApiError(error), "error");
      }
    }

    async function handleCatalogAction(action, row) {
      if (!catalogApi || !row) return;
      const slug = row.dataset.catalogSlug;
      const id = row.dataset.catalogId;
      const label = catalogLabels[slug] || slug;
      if (!slug || !id) {
        AdminRuntime.toast("Không xác định mục danh mục.", "error");
        return;
      }
      if (action === "view") {
        AdminRuntime.toast(`Chi tiết ${label} sẽ được bổ sung sau.`, "info");
        return;
      }
      if (action === "edit") {
        const current = row.dataset.catalogName || "";
        const raw = window.prompt(`Đổi tên ${label}`, current);
        if (raw === null) return;
        const name = raw.trim();
        if (!name) {
          AdminRuntime.toast("Tên không được để trống.", "error");
          return;
        }
        try {
          await catalogApi.update(slug, id, { name });
          AdminRuntime.toast(`Đã cập nhật ${label}.`, "success");
          await loadCatalog(slug);
        } catch (error) {
          AdminRuntime.toast(resolveApiError(error), "error");
        }
        return;
      }
      if (action === "delete") {
        if (!window.confirm(`Bạn có chắc muốn xóa ${label}?`)) return;
        try {
          await catalogApi.delete(slug, id);
          AdminRuntime.toast(`Đã xóa ${label}.`, "success");
          await loadCatalog(slug);
        } catch (error) {
          AdminRuntime.toast(resolveApiError(error), "error");
        }
      }
    }

    const addButtons = Array.from(document.querySelectorAll("[data-catalog-add]"));
    addButtons.forEach((btn) => {
      const slug = btn.dataset.catalogAdd;
      if (!slug) return;
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        handleCatalogAdd(slug);
      });
    });

    document.addEventListener("click", (event) => {
      const actionBtn = event.target.closest("[data-catalog-action]");
      if (!actionBtn) return;
      event.preventDefault();
      const row = actionBtn.closest("[data-catalog-row]");
      handleCatalogAction(actionBtn.dataset.catalogAction, row);
    });

    catalogMap.forEach((_, slug) => {
      loadCatalog(slug);
    });
  }

  function initCauHinh() {
    const numberingForm = $("#qt-numbering-form");
    const templateForm = $("#qt-template-form");

    numberingForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      handleNumberingFormSubmit(event);
    });
    templateForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      handleTemplateFormSubmit(event);
    });

    const panels = [
      createConfigPanel({
        openBtn: "#qt-btn-open-numbering",
        panel: "#qt-numbering-panel",
        closeBtn: "#qt-numbering-close",
        form: "#qt-numbering-form",
        feedback: "#qt-numbering-feedback",
      }),
      createConfigPanel({
        openBtn: "#qt-btn-open-template",
        panel: "#qt-template-panel",
        closeBtn: "#qt-template-close",
        form: "#qt-template-form",
        feedback: "#qt-template-feedback",
      }),
      createConfigPanel({
        openBtn: "#qt-btn-open-transition",
        panel: "#qt-transition-panel",
        closeBtn: "#qt-transition-close",
        form: "#qt-transition-form",
        feedback: "#qt-transition-feedback",
      }),
    ];

    panels.forEach((panel) => panel?.init());

    $("#qt-btn-open-numbering")?.addEventListener("click", () => openNumberingForm("create"));
    $("#qt-btn-open-template")?.addEventListener("click", () => openTemplateForm("create"));

    $("#qt-numbering-body")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action='edit-numbering']");
      if (!button) return;
      const ruleId = button.dataset.ruleId;
      const rule = numberingRulesCache.find((item) => String(item.rule_id) === String(ruleId));
      if (rule) {
        openNumberingForm("edit", rule);
        document.getElementById("qt-numbering-panel")?.classList.remove("hidden");
      }
    });
    $("#qt-template-body")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action='edit-template']");
      if (!button) return;
      const templateId = button.dataset.templateId;
      const template = templateCache.find((item) => String(item.template_id) === String(templateId));
      if (template) {
        openTemplateForm("edit", template);
        document.getElementById("qt-template-panel")?.classList.remove("hidden");
      }
    });

    loadRegisterBooks();
    loadNumberingSummary();
    loadNumberingRules();
    loadTemplates();

    $$('[data-sync-config]').forEach((btn) =>
      btn.addEventListener("click", () => AdminRuntime.toast("Đã lưu cấu hình, sẽ sync với server sau."))
    );
  }

  const REGISTER_RESET_LABELS = {
    yearly: 'Hằng năm',
    quarterly: 'Theo quý',
    monthly: 'Hằng tháng',
    never: 'Không reset',
  };

  const NUMBERING_RESET_LABELS = {
    ...REGISTER_RESET_LABELS,
    manual: 'Thủ công',
  };
  const NUMBERING_DIRECTION_LABELS = {
    incoming: 'Văn bản đến',
    outgoing: 'Văn bản đi',
  };
  const TEMPLATE_DIRECTION_LABELS = {
    du_thao: 'Dự thảo',
    di: 'Văn bản đi',
    den: 'Văn bản đến',
  };
  let numberingRulesCache = [];
  let templateCache = [];
  const numberingFormState = { mode: 'create', rule: null };
  const templateFormState = { mode: 'create', template: null };

  async function loadRegisterBooks() {
    const body = document.getElementById('qt-register-body');
    const totalEl = document.getElementById('qt-register-total');
    if (!body) return;
    const api = window.ApiClient;
    if (!api?.registerBooks) {
      body.innerHTML =
        '<tr><td colspan="7" class="px-4 py-6 text-center text-slate-400 text-sm">Register book API not available.</td></tr>';
      if (totalEl) totalEl.textContent = '0';
      return;
    }
    body.innerHTML =
      '<tr><td colspan="7" class="px-4 py-6 text-center text-slate-400 text-sm">Đang tải dữ liệu sổ đăng ký...</td></tr>';
    try {
      const response = await api.registerBooks.list({ page_size: 32 });
      const books = api.extractItems(response);
      if (!books.length) {
        body.innerHTML =
          '<tr><td colspan="7" class="px-4 py-6 text-center text-slate-400 text-sm">Chưa có sổ đăng ký nào.</td></tr>';
        if (totalEl) totalEl.textContent = '0';
        return;
      }
      body.innerHTML = books
        .map((book) => {
          const direction =
            book.direction === 'di' ? 'Văn bản đi' : book.direction === 'den' ? 'Văn bản đến' : 'Khác';
          const reset = REGISTER_RESET_LABELS[book.reset_policy] || book.reset_policy || '—';
          const status = book.is_active ? 'Hoạt động' : 'Đã khóa';
          return `<tr class="hover:bg-slate-50/60">
            <td class="px-4 py-3 font-mono text-[12px] text-slate-600">${book.prefix || '—'}</td>
            <td class="px-4 py-3">${book.name || '—'}</td>
            <td class="px-4 py-3">${direction}</td>
            <td class="px-4 py-3">${book.year || '—'}</td>
            <td class="px-4 py-3">${book.next_sequence ?? '—'}</td>
            <td class="px-4 py-3">${reset}</td>
            <td class="px-4 py-3">
              <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[12px] ${
                book.is_active ? 'border-slate-300 text-slate-700' : 'border-rose-200 text-rose-600'
              }">${status}</span>
            </td>
          </tr>`;
        })
        .join('');
      if (totalEl) totalEl.textContent = String(books.length);
    } catch (error) {
      body.innerHTML = `<tr><td colspan="7" class="px-4 py-6 text-center text-rose-500 text-sm">${resolveApiError(
        error
      )}</td></tr>`;
      if (totalEl) totalEl.textContent = '0';
    }
  }

  async function loadNumberingSummary() {
    const countEl = document.getElementById('qt-numbering-count');
    const activeEl = document.getElementById('qt-numbering-active');
    const api = window.ApiClient;
    if (!api?.numberingRules) {
      if (countEl) countEl.textContent = '—';
      if (activeEl) activeEl.textContent = '—';
      return;
    }
    try {
      const response = await api.numberingRules.list({ page_size: 64 });
      const rules = api.extractItems(response);
      if (countEl) countEl.textContent = String(rules.length);
      if (activeEl) {
        const activeCount = rules.filter((rule) => rule.is_active).length;
        activeEl.textContent = String(activeCount);
      }
    } catch (error) {
      if (countEl) countEl.textContent = '—';
      if (activeEl) activeEl.textContent = '—';
      console.error('[quantri] loadNumberingSummary', error);
    }
  }

  async function loadNumberingRules() {
    const body = document.getElementById("qt-numbering-body");
    if (!body) return;
    const api = window.ApiClient;
    if (!api?.numberingRules) {
      body.innerHTML =
        '<tr><td colspan="8" class="px-4 py-6 text-center text-slate-400 text-sm">Số quy tắc chưa hiển thị.</td></tr>';
      return;
    }
    body.innerHTML =
      '<tr><td colspan="8" class="px-4 py-6 text-center text-slate-500 text-sm">Đang tải quy tắc đánh số...</td></tr>';
    try {
      const response = await api.numberingRules.list({ ordering: "-updated_at", page_size: 200 });
      const rules = api.extractItems(response);
      numberingRulesCache = rules;
      renderNumberingRules(rules);
    } catch (error) {
      body.innerHTML = `<tr><td colspan="8" class="px-4 py-6 text-center text-rose-500 text-sm">${resolveApiError(
        error
      )}</td></tr>`;
    }
  }

  function renderNumberingRules(rules) {
    const body = document.getElementById("qt-numbering-body");
    if (!body) return;
    if (!rules.length) {
      body.innerHTML =
        '<tr><td colspan="8" class="px-4 py-6 text-center text-slate-500 text-sm">Chưa có quy tắc đánh số.</td></tr>';
      return;
    }
    body.innerHTML = rules
      .map((rule) => {
        const direction = NUMBERING_DIRECTION_LABELS[rule.target] || rule.target || "Khác";
        const reset = NUMBERING_RESET_LABELS[rule.reset_policy] || rule.reset_policy || "—";
        const prefixSuffix = `${rule.prefix || "—"} / ${rule.suffix || "—"}`;
        const seqValue = rule.next_sequence ?? rule.start_sequence ?? "—";
        const statusClass = rule.is_active ? "badge badge--green" : "badge badge--muted";
        const statusLabel = rule.is_active ? "Hoạt động" : "Tạm dừng";
        return `<tr>
          <td class="px-4 py-3 font-mono text-[12px] text-slate-600">${escapeHtml(rule.code)}</td>
          <td class="px-4 py-3">${escapeHtml(rule.name)}</td>
          <td class="px-4 py-3">${escapeHtml(direction)}</td>
          <td class="px-4 py-3">${escapeHtml(prefixSuffix)}</td>
          <td class="px-4 py-3">${escapeHtml(reset)}</td>
          <td class="px-4 py-3">${escapeHtml(String(seqValue))}</td>
          <td class="px-4 py-3">
            <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[12px] ${statusClass}">${statusLabel}</span>
          </td>
          <td class="px-4 py-3 text-right">
            <button
              type="button"
              class="h-8 px-3 rounded-lg border border-slate-200 text-[13px] hover:bg-slate-50"
              data-action="edit-numbering"
              data-rule-id="${rule.rule_id}"
            >
              Sửa
            </button>
          </td>
        </tr>`;
      })
      .join("");
  }

  async function loadTemplates() {
    const body = document.getElementById("qt-template-body");
    if (!body) return;
    const api = window.ApiClient;
    if (!api?.documentTemplates) {
      body.innerHTML =
        '<tr><td colspan="7" class="px-4 py-6 text-center text-slate-400 text-sm">API mẫu văn bản chưa sẵn sàng.</td></tr>';
      return;
    }
    body.innerHTML =
      '<tr><td colspan="7" class="px-4 py-6 text-center text-slate-500 text-sm">Đang tải mẫu văn bản...</td></tr>';
    try {
      const response = await api.documentTemplates.list({ ordering: "-updated_at", page_size: 200 });
      const templates = api.extractItems(response);
      templateCache = templates;
      renderTemplates(templates);
    } catch (error) {
      body.innerHTML = `<tr><td colspan="7" class="px-4 py-6 text-center text-rose-500 text-sm">${resolveApiError(
        error
      )}</td></tr>`;
    }
  }

  function renderTemplates(templates) {
    const body = document.getElementById("qt-template-body");
    if (!body) return;
    if (!templates.length) {
      body.innerHTML =
        '<tr><td colspan="7" class="px-4 py-6 text-center text-slate-500 text-sm">Chưa có mẫu nào.</td></tr>';
      return;
    }
    body.innerHTML = templates
      .map((template) => {
        const direction = TEMPLATE_DIRECTION_LABELS[template.doc_direction] || template.doc_direction || "—";
        const tags = Array.isArray(template.tags) ? template.tags.join(", ") : template.tags || "—";
        const statusClass = template.is_active ? "badge badge--green" : "badge badge--muted";
        const statusLabel = template.is_active ? "Hoạt động" : "Đã khóa";
        const version = template.version || template.version === 0 ? template.version : "—";
        return `<tr>
          <td class="px-4 py-3 font-medium text-slate-700">${escapeHtml(template.name)}</td>
          <td class="px-4 py-3">${escapeHtml(direction)}</td>
          <td class="px-4 py-3">${escapeHtml(String(version))}</td>
          <td class="px-4 py-3">${escapeHtml(template.format || "—")}</td>
          <td class="px-4 py-3">
            <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[12px] ${statusClass}">${statusLabel}</span>
          </td>
          <td class="px-4 py-3 text-[12px] text-slate-600">${escapeHtml(tags)}</td>
          <td class="px-4 py-3 text-right">
            <button
              type="button"
              class="h-8 px-3 rounded-lg border border-slate-200 text-[13px] hover:bg-slate-50"
              data-action="edit-template"
              data-template-id="${template.template_id}"
            >
              Sửa
            </button>
          </td>
        </tr>`;
      })
      .join("");
  }

  function openNumberingForm(mode, rule = null) {
    numberingFormState.mode = mode;
    numberingFormState.rule = rule;
    document.getElementById("qt-numbering-id").value = rule?.rule_id || "";
    const heading = document.querySelector("#qt-numbering-panel h3");
    if (heading) {
      heading.textContent =
        mode === "edit" ? "Chỉnh sửa quy tắc đánh số" : "Quy tắc đánh số";
    }
    const inputs = {
      code: document.getElementById("qt-numbering-code"),
      name: document.getElementById("qt-numbering-name"),
      target: document.getElementById("qt-numbering-target"),
      prefix: document.getElementById("qt-numbering-prefix"),
      suffix: document.getElementById("qt-numbering-suffix"),
      padding: document.getElementById("qt-numbering-padding"),
      next: document.getElementById("qt-numbering-next"),
      reset: document.getElementById("qt-numbering-reset"),
      description: document.getElementById("qt-numbering-description"),
      active: document.getElementById("qt-numbering-active"),
    };
    if (!rule) {
      clearNumberingForm();
      return;
    }
    if (inputs.code) inputs.code.value = rule.code || "";
    if (inputs.name) inputs.name.value = rule.name || "";
    if (inputs.target) inputs.target.value = rule.target || "";
    if (inputs.prefix) inputs.prefix.value = rule.prefix || "";
    if (inputs.suffix) inputs.suffix.value = rule.suffix || "";
    if (inputs.padding) inputs.padding.value = String(rule.padding ?? 4);
    if (inputs.next) inputs.next.value = String(rule.next_sequence ?? rule.start_sequence ?? "");
    if (inputs.reset) inputs.reset.value = rule.reset_policy || "yearly";
    if (inputs.description) inputs.description.value = rule.description || "";
    if (inputs.active) inputs.active.checked = Boolean(rule.is_active);
  }

  function clearNumberingForm() {
    const fields = [
      "qt-numbering-code",
      "qt-numbering-name",
      "qt-numbering-prefix",
      "qt-numbering-suffix",
      "qt-numbering-padding",
      "qt-numbering-next",
      "qt-numbering-description",
    ];
    fields.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const targetField = document.getElementById("qt-numbering-target");
    const resetField = document.getElementById("qt-numbering-reset");
    const activeField = document.getElementById("qt-numbering-active");
    if (targetField) targetField.value = "incoming";
    if (resetField) resetField.value = "yearly";
    if (activeField) activeField.checked = true;
  }

  async function handleNumberingFormSubmit() {
    const api = window.ApiClient;
    if (!api?.numberingRules) {
      AdminRuntime.toast("Không hỗ trợ quy tắc đánh số.", "error");
      return;
    }
    const payload = {
      code: document.getElementById("qt-numbering-code")?.value?.trim(),
      name: document.getElementById("qt-numbering-name")?.value?.trim(),
      target: document.getElementById("qt-numbering-target")?.value,
      prefix: document.getElementById("qt-numbering-prefix")?.value?.trim() || null,
      suffix: document.getElementById("qt-numbering-suffix")?.value?.trim() || null,
      padding: Number.parseInt(document.getElementById("qt-numbering-padding")?.value, 10) || 4,
      next_sequence: Number.parseInt(document.getElementById("qt-numbering-next")?.value, 10) || undefined,
      reset_policy: document.getElementById("qt-numbering-reset")?.value || "yearly",
      description: document.getElementById("qt-numbering-description")?.value?.trim() || null,
      is_active: document.getElementById("qt-numbering-active")?.checked || false,
    };
    const submitBtn = document.querySelector("#qt-numbering-form button[type='submit']");
    const originalLabel = submitBtn?.textContent || "Lưu quy tắc";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = numberingFormState.mode === "edit" ? "Đang cập nhật..." : "Đang tạo...";
    }
    try {
      if (numberingFormState.mode === "edit" && numberingFormState.rule) {
        await api.numberingRules.update(numberingFormState.rule.rule_id, payload);
      } else {
        await api.numberingRules.create(payload);
      }
      AdminRuntime.toast("Đã lưu quy tắc đánh số.", "success");
      loadNumberingRules();
      loadNumberingSummary();
      openNumberingForm("create");
      document.getElementById("qt-numbering-panel")?.classList.add("hidden");
    } catch (error) {
      console.error("[quantri] numbering form submit failed", error);
      AdminRuntime.toast(resolveApiError(error), "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    }
  }

  function openTemplateForm(mode, template = null) {
    templateFormState.mode = mode;
    templateFormState.template = template;
    document.getElementById("qt-template-id").value = template?.template_id || "";
    const heading = document.querySelector("#qt-template-panel h3");
    if (heading) {
      heading.textContent = mode === "edit" ? "Chỉnh sửa mẫu văn bản" : "Mẫu văn bản";
    }
    const fields = {
      name: document.getElementById("qt-template-name"),
      direction: document.getElementById("qt-template-direction"),
      format: document.getElementById("qt-template-format"),
      tags: document.getElementById("qt-template-tags"),
      description: document.getElementById("qt-template-description"),
      content: document.getElementById("qt-template-content"),
      active: document.getElementById("qt-template-active"),
    };
    if (!template) {
      clearTemplateForm();
      return;
    }
    if (fields.name) fields.name.value = template.name || "";
    if (fields.direction) fields.direction.value = template.doc_direction || "du_thao";
    if (fields.format) fields.format.value = template.format || "html";
    if (fields.tags) {
      fields.tags.value = Array.isArray(template.tags) ? template.tags.join(", ") : template.tags || "";
    }
    if (fields.description) fields.description.value = template.description || "";
    if (fields.content) fields.content.value = template.content || "";
    if (fields.active) fields.active.checked = Boolean(template.is_active);
  }

  function clearTemplateForm() {
    ["qt-template-name", "qt-template-tags", "qt-template-description", "qt-template-content"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const directionField = document.getElementById("qt-template-direction");
    const formatField = document.getElementById("qt-template-format");
    const activeField = document.getElementById("qt-template-active");
    if (directionField) directionField.value = "du_thao";
    if (formatField) formatField.value = "html";
    if (activeField) activeField.checked = true;
  }

  async function handleTemplateFormSubmit() {
    const api = window.ApiClient;
    if (!api?.documentTemplates) {
      AdminRuntime.toast("Không thể lưu mẫu văn bản.", "error");
      return;
    }
    const payload = {
      name: document.getElementById("qt-template-name")?.value?.trim(),
      doc_direction: document.getElementById("qt-template-direction")?.value,
      format: document.getElementById("qt-template-format")?.value,
      tags: parseTags(document.getElementById("qt-template-tags")?.value),
      description: document.getElementById("qt-template-description")?.value?.trim() || null,
      content: document.getElementById("qt-template-content")?.value?.trim(),
      is_active: document.getElementById("qt-template-active")?.checked || false,
    };
    const submitBtn = document.querySelector("#qt-template-form button[type='submit']");
    const originalLabel = submitBtn?.textContent || "Lưu mẫu";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = templateFormState.mode === "edit" ? "Đang cập nhật..." : "Đang tạo...";
    }
    try {
      if (templateFormState.mode === "edit" && templateFormState.template) {
        await api.documentTemplates.update(templateFormState.template.template_id, payload);
      } else {
        await api.documentTemplates.create(payload);
      }
      AdminRuntime.toast("Đã lưu mẫu văn bản.", "success");
      loadTemplates();
      openTemplateForm("create");
      document.getElementById("qt-template-panel")?.classList.add("hidden");
    } catch (error) {
      console.error("[quantri] template form submit failed", error);
      AdminRuntime.toast(resolveApiError(error), "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    }
  }

  function parseTags(value) {
    if (!value) return [];
    return value
      .split(/[,;]/)
      .map((token) => token.trim())
      .filter(Boolean);
  }

  function resolveApiError(error) {
    const helpers = window.DocHelpers;
    if (helpers?.resolveErrorMessage) {
      return helpers.resolveErrorMessage(error);
    }
    if (!error) return 'Không thể tải dữ liệu.';
    if (error.data) {
      if (typeof error.data === 'string') return error.data;
      if (error.data.detail) return String(error.data.detail);
    }
    if (error.message) return String(error.message);
    return 'Không thể tải dữ liệu.';
  }

  function createConfigPanel(options) {
    const openBtn = $(options.openBtn);
    const panel = $(options.panel);
    const closeBtn = $(options.closeBtn);
    const form = $(options.form);
    const feedback = $(options.feedback);
    if (!openBtn || !panel || !closeBtn || !form) return null;
    const open = () => panel.classList.remove("hidden");
    const close = () => panel.classList.add("hidden");
    openBtn.addEventListener("click", open);
    closeBtn.addEventListener("click", close);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      feedback.textContent = `Đã lưu bản nháp (${new Date().toLocaleTimeString("vi-VN")}).`;
      AdminRuntime.toast("Đã lưu cấu hình tạm.");
      console.info("[quantri] draft data", data);
      close();
    });
    form.querySelector(options.resetBtn || "[type='reset']")?.addEventListener("click", () => {
      feedback.textContent = "Đã xóa dữ liệu tạm.";
    });
    return { init: noop };
  }

  /* --------------------------- Hồ sơ lưu trữ --------------------------- */
  function initHoSoLuuTru() {
    const navButtons = $$('[data-archive-tab]');
    archiveAuthNoticeElement = document.getElementById("archiveAuthNotice");
    setArchiveAuthNotice("");
    const panels = $$('[data-archive-panel]');
    if (!navButtons.length || !panels.length) return;

    const setActiveState = (btn, isActive) => {
      const activeClasses = ["bg-blue-600", "text-white", "shadow-sm"];
      const inactiveClasses = ["bg-white", "text-slate-700"];
      btn.classList.toggle("is-active", isActive);
      activeClasses.forEach((cls) => btn.classList.toggle(cls, isActive));
      inactiveClasses.forEach((cls) => btn.classList.toggle(cls, !isActive));
    };

    const show = (tab) => {
      navButtons.forEach((btn) => setActiveState(btn, btn.dataset.archiveTab === tab));
      panels.forEach((panel) => panel.classList.toggle("hidden", panel.dataset.archivePanel !== tab));
    };
    navButtons.forEach((btn) => btn.addEventListener("click", () => show(btn.dataset.archiveTab)));
    const initialTab =
      navButtons.find((btn) => btn.classList.contains("is-active"))?.dataset.archiveTab ||
      navButtons[0].dataset.archiveTab;
    if (initialTab) {
      show(initialTab);
    }

    document.getElementById("btn-backup")?.addEventListener("click", (event) => {
      event.preventDefault();
      handleCreateBackup();
    });
    document.getElementById("btn-restore")?.addEventListener("click", (event) => {
      event.preventDefault();
      handleRestoreBackup();
    });
    document.getElementById("btn-archive")?.addEventListener("click", (event) => {
      event.preventDefault();
      handleArchiveQueue();
    });

    setupArchiveConfigForm();

    loadArchiveSummary();
    loadArchiveBackups();
    loadArchiveQueue();
    loadRetentionPolicies();
    loadArchiveConfig();
  }

  async function loadArchiveSummary() {
    const api = window.ApiClient?.archive;
    const totalEl = document.getElementById("archiveDocsTotal");
    const activeEl = document.getElementById("archiveCasesActive");
    const pendingEl = document.getElementById("archiveQueuePending");
    const latestEl = document.getElementById("archiveLatestSync");
    const progressBar = document.getElementById("archiveProgressBar");
    const storageFallbackIds = [
      "archiveStorageDocument",
      "archiveStorageImage",
      "archiveStorageVideo",
      "archiveStorageOther",
    ];
    const placeholder = "—";
    const applyPlaceholders = () => {
      if (totalEl) totalEl.textContent = placeholder;
      if (activeEl) activeEl.textContent = placeholder;
      if (pendingEl) pendingEl.textContent = placeholder;
      if (latestEl) latestEl.textContent = placeholder;
      if (progressBar) progressBar.style.width = "0%";
      storageFallbackIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = placeholder;
      });
    };

    if (!api?.summary) {
      applyPlaceholders();
      setArchiveAuthNotice("");
      return;
    }
    const token = window.ApiClient?.getAccessToken?.();
    if (!token) {
      applyPlaceholders();
      setArchiveAuthNotice("Đăng nhập để xem số liệu Hồ sơ & Lưu trữ.");
      return;
    }
    try {
      const payload = await api.summary();
      const data = payload?.data || payload;
      if (!data) {
        throw new Error("Thiếu dữ liệu lưu trữ.");
      }
      if (totalEl) totalEl.textContent = formatNumber(data.total_documents || 0);
      if (activeEl) activeEl.textContent = formatNumber(data.total_cases || 0);
      if (pendingEl) pendingEl.textContent = formatNumber(data.pending_queue || 0);
      if (latestEl) {
        latestEl.textContent = data.latest_sync ? formatDateTime(data.latest_sync) : "Chưa có";
      }
      if (progressBar) {
        const storage = data.storage || {};
        const ratio = storage.capacity_bytes
          ? Math.min(100, Math.round((storage.total_bytes || 0) / storage.capacity_bytes * 100))
          : 0;
        progressBar.style.width = `${ratio}%`;
      }
      updateArchiveStorageDisplay(data.storage);
      setArchiveAuthNotice("");
    } catch (error) {
      console.error("[quantri] loadArchiveSummary failed", error);
      applyPlaceholders();
      const message =
        error?.status === 401
          ? "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại."
          : "Không thể tải dữ liệu lưu trữ. Thử lại sau.";
      setArchiveAuthNotice(message);
    }
  }

  function updateArchiveStorageDisplay(storage = {}) {
    const breakdown = (storage.breakdown || []).reduce((acc, item) => {
      acc[item.label] = Number(item.size_bytes) || 0;
      return acc;
    }, {});
    const mapping = {
      archiveStorageDocument: "Văn bản",
      archiveStorageImage: "Hình ảnh",
      archiveStorageVideo: "Đoạn phim",
      archiveStorageOther: "Khác",
    };
    Object.entries(mapping).forEach(([elementId, label]) => {
      const el = document.getElementById(elementId);
      if (!el) return;
      const value = breakdown[label] || 0;
      el.textContent = value > 0 ? humanReadableStorage(value) : "—";
    });
  }

  async function loadArchiveBackups() {
    const api = window.ApiClient?.archive?.backups;
    const container = document.getElementById("archiveBackupList");
    if (!api || !container) return;
    try {
      const payload = await api.list();
      const backups = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
        ? payload
        : [];
      archiveState.backups = backups;
      renderArchiveBackups(backups);
    } catch (error) {
      console.error("[quantri] loadArchiveBackups failed", error);
      renderArchiveBackups([]);
    }
  }

  function renderArchiveBackups(backups) {
    const container = document.getElementById("archiveBackupList");
    const restoreSelect = document.getElementById("archiveRestoreSelect");
    const hint = document.getElementById("archiveRestoreHint");
    if (!container) return;
    if (!Array.isArray(backups) || backups.length === 0) {
      container.innerHTML =
        '<li class="text-sm text-slate-500">Chưa có bản sao lưu nào.</li>';
      if (restoreSelect) {
        restoreSelect.innerHTML =
          '<option value="">Chưa có bản sao lưu</option>';
        restoreSelect.disabled = true;
      }
      if (hint) hint.textContent = "Vui lòng tạo bản sao lưu trước khi khôi phục.";
      return;
    }
    const listItems = backups
      .map((backup) => {
        const timestamp = backup.created_at ? formatDateTime(backup.created_at) : "—";
        const size = humanReadableStorage(Number(backup.size_bytes) || 0);
        const durationMinutes = backup.duration_seconds
          ? Math.round(backup.duration_seconds / 60)
          : null;
        const methodBadge = escapeHtml(backup.method_label || backup.method || "—");
        const statusBadge = escapeHtml(backup.status_label || backup.status || "—");
        return `
          <li class="rounded-lg border border-slate-200 px-4 py-3 space-y-2">
            <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div class="flex-1 space-y-1">
                <div class="font-medium">${escapeHtml(backup.title || "Sao lưu hệ thống")}</div>
                <p class="text-[12px] text-slate-500">
                  ${timestamp} • ${size} ${durationMinutes ? `• ${durationMinutes} phút` : ""}
                </p>
                <div class="flex flex-wrap gap-2 text-[11px] font-semibold">
                  <span class="inline-flex px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    ${methodBadge}
                  </span>
                  <span class="inline-flex px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                    ${statusBadge}
                  </span>
                </div>
              </div>
            </div>
          </li>
        `;
      })
      .join("");
    container.innerHTML = listItems;
    if (restoreSelect) {
      restoreSelect.disabled = false;
      const options = backups
        .map(
          (backup) =>
            `<option value="${escapeHtml(backup.backup_id)}">${escapeHtml(
              backup.title || "Bản sao lưu"
            )} • ${formatDateTime(backup.created_at)}</option>`
        )
        .join("");
      restoreSelect.innerHTML =
        '<option value="">Chọn bản sao lưu</option>' + options;
    }
    if (hint) {
      hint.textContent = "Chọn bản sao lưu để khôi phục dữ liệu.";
    }
  }

  async function loadArchiveQueue() {
    const api = window.ApiClient?.archive?.queue;
    const container = document.getElementById("archiveQueueList");
    if (!api || !container) return;
    try {
      const payload = await api.list();
      const items = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
        ? payload
        : [];
      renderArchiveQueue(items);
    } catch (error) {
      console.error("[quantri] loadArchiveQueue failed", error);
      container.innerHTML =
        '<li class="text-sm text-slate-500">Không thể tải hàng đợi lưu trữ.</li>';
    }
  }

  function renderArchiveQueue(items) {
    const container = document.getElementById("archiveQueueList");
    if (!container) return;
    if (!Array.isArray(items) || !items.length) {
      container.innerHTML =
        '<li class="text-sm text-slate-500">Không có tác vụ lưu trữ đang chạy.</li>';
      return;
    }
    const rows = items
      .map((item) => {
        const progress = Math.min(100, Number(item.progress) || 0);
        const size = humanReadableStorage(Number(item.size_bytes) || 0);
        const metaLines = [
          item.category ? `Danh mục: ${escapeHtml(item.category)}` : null,
          size !== "0 GB" ? `Kích thước: ${size}` : null,
        ]
          .filter(Boolean)
          .join(" • ");
        const statusClasses = getQueueBadgeClasses(item.status);
        const label = escapeHtml(item.label || "Tác vụ lưu trữ");
        return `
          <li class="rounded-lg border border-slate-200 p-4">
            <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
              <div class="flex-1 space-y-1">
                <div class="font-medium">${label}</div>
                <p class="text-[12px] text-slate-500">${metaLines}</p>
              </div>
              <span class="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold ${statusClasses}">
                ${escapeHtml(item.status_label || item.status || "—")}
              </span>
            </div>
            <div class="mt-3 h-2 rounded-full bg-slate-200">
              <div class="h-full rounded-full bg-slate-900" style="width: ${progress}%"></div>
            </div>
          </li>
        `;
      })
      .join("");
    container.innerHTML = rows;
  }

  async function loadRetentionPolicies() {
    const api = window.ApiClient?.archive?.policies;
    const container = document.getElementById("archivePolicyList");
    if (!api || !container) return;
    container.innerHTML =
      '<tr><td colspan="7" class="px-4 py-3 text-sm text-slate-500">Đang tải quy định lưu trữ...</td></tr>';
    try {
      const payload = await api.list();
      const policies = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
        ? payload
        : [];
      archiveState.policies = policies;
      renderRetentionPolicies(policies);
    } catch (error) {
      console.error("[quantri] loadRetentionPolicies failed", error);
      container.innerHTML =
        '<tr><td colspan="7" class="px-4 py-3 text-sm text-rose-600">Không thể tải quy định.</td></tr>';
    }
  }

  function renderRetentionPolicies(policies) {
    const container = document.getElementById("archivePolicyList");
    if (!container) return;
    if (!Array.isArray(policies) || !policies.length) {
      container.innerHTML =
        '<tr><td colspan="7" class="px-4 py-3 text-sm text-slate-500">Chưa có quy định lưu trữ.</td></tr>';
      return;
    }
    const rows = policies
      .map((policy) => {
        const statusClasses = getPolicyBadgeClasses(policy.status);
        const nextReview = policy.next_review_at
          ? new Date(policy.next_review_at).toLocaleDateString("vi-VN")
          : "Chưa có";
        return `
          <tr class="hover:bg-slate-50/60">
            <td class="px-4 py-3">
              ${escapeHtml(policy.name)}
              <div class="text-[12px] text-slate-500">
                ${escapeHtml(policy.description || "—")}
              </div>
            </td>
            <td class="px-4 py-3">
              <span class="badge">${escapeHtml(policy.category || "—")}</span>
            </td>
            <td class="px-4 py-3">${escapeHtml(String(policy.retention_years || "—"))} năm</td>
            <td class="px-4 py-3">${formatNumber(policy.quantity || 0)}</td>
            <td class="px-4 py-3">
              <span class="badge ${statusClasses}">${escapeHtml(policy.status_label || policy.status || "—")}</span>
            </td>
            <td class="px-4 py-3">${escapeHtml(nextReview)}</td>
            <td class="px-4 py-3">
              <div class="flex gap-2">
                <button
                  data-policy-edit="${policy.policy_id}"
                  class="px-3 h-8 rounded-md bg-slate-100 text-[12px] hover:bg-slate-200"
                >
                  Chỉnh sửa
                </button>
                <button
                  data-policy-review="${policy.policy_id}"
                  class="px-3 h-8 rounded-md bg-slate-100 text-[12px] hover:bg-slate-200"
                >
                  Rà soát
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
    container.innerHTML = rows;
    container.querySelectorAll("[data-policy-edit]").forEach((btn) => {
      btn.addEventListener("click", () => handlePolicyEdit(btn.dataset.policyEdit));
    });
    container.querySelectorAll("[data-policy-review]").forEach((btn) => {
      btn.addEventListener("click", () => handlePolicyReview(btn.dataset.policyReview));
    });
  }

  function getPolicyBadgeClasses(status) {
    if (status === "review") {
      return "bg-amber-50 border-amber-200 text-amber-700";
    }
    if (status === "archived") {
      return "bg-slate-100 border-slate-200 text-slate-500";
    }
    return "bg-emerald-50 border-emerald-200 text-emerald-700";
  }

  function getQueueBadgeClasses(status) {
    if (status === "completed") {
      return "bg-emerald-50 border-emerald-200 text-emerald-700";
    }
    if (status === "processing") {
      return "bg-blue-50 border-blue-200 text-blue-700";
    }
    if (status === "failed") {
      return "bg-rose-50 border-rose-200 text-rose-700";
    }
    return "bg-amber-50 border-amber-200 text-amber-700";
  }

  async function handleCreateBackup() {
    const api = window.ApiClient?.archive?.backups;
    if (!api) {
      AdminRuntime.toast("Không thể tạo sao lưu lúc này.", "error");
      return;
    }
    try {
      await api.create({ method: "manual" });
      AdminRuntime.toast("Đã tạo yêu cầu sao lưu.", "success");
      loadArchiveBackups();
      loadArchiveQueue();
    } catch (error) {
      console.error("[quantri] create backup failed", error);
      AdminRuntime.toast(resolveApiError(error), "error");
    }
  }

  async function handleRestoreBackup() {
    const select = document.getElementById("archiveRestoreSelect");
    if (!select || !select.value) {
      AdminRuntime.toast("Chọn bản sao lưu để khôi phục.", "warn");
      return;
    }
    const api = window.ApiClient?.archive?.backups;
    if (!api) {
      AdminRuntime.toast("Không thể thực hiện khôi phục lúc này.", "error");
      return;
    }
    try {
      await api.restore(select.value);
      AdminRuntime.toast("Yêu cầu khôi phục đang chờ xử lý.", "success");
      loadArchiveQueue();
    } catch (error) {
      console.error("[quantri] restore backup failed", error);
      AdminRuntime.toast(resolveApiError(error), "error");
    }
  }

  async function handleArchiveQueue() {
    const api = window.ApiClient?.archive?.queue;
    if (!api) {
      AdminRuntime.toast("Không thể đưa vào hàng đợi.", "error");
      return;
    }
    try {
      await api.create({ label: "Lưu trữ thủ công", category: "manual" });
      AdminRuntime.toast("Đã thêm vào hàng đợi lưu trữ.", "success");
      loadArchiveQueue();
    } catch (error) {
      console.error("[quantri] archive queue action failed", error);
      AdminRuntime.toast(resolveApiError(error), "error");
    }
  }

  function setupArchiveConfigForm() {
    const form = document.getElementById("archiveConfigForm");
    if (!form) return;
    form.addEventListener("submit", (event) => saveArchiveConfig(event));
  }

  async function loadArchiveConfig() {
    const api = window.ApiClient?.systemSettings;
    const feedback = document.getElementById("archiveConfigFeedback");
    if (!api) {
      if (feedback) feedback.textContent = "Không thể tải cấu hình.";
      return;
    }
    try {
      const payload = await api.allSettings();
      const settings = payload?.data || payload || {};
      setSelectValue("archiveConfigFrequency", settings.archive_auto_backup_frequency, "daily_02:00");
      setSelectValue("archiveConfigRetention", settings.archive_backup_retention_count, "30");
      setSelectValue("archiveConfigThreshold", settings.archive_alert_threshold, "80");
      setSelectValue(
        "archiveConfigAutoArchive",
        settings.archive_auto_archive_enabled === undefined ||
          settings.archive_auto_archive_enabled === null
          ? "true"
          : String(settings.archive_auto_archive_enabled)
      );
      if (feedback) feedback.textContent = "";
    } catch (error) {
      console.error("[quantri] loadArchiveConfig failed", error);
      if (feedback) {
        feedback.textContent = "Không thể tải cấu hình.";
      }
    }
  }

  async function saveArchiveConfig(event) {
    event?.preventDefault();
    const api = window.ApiClient?.systemSettings;
    const form = document.getElementById("archiveConfigForm");
    const feedback = document.getElementById("archiveConfigFeedback");
    const button = document.getElementById("archiveConfigSave");
    if (!api || !form) return;
    const frequency = form.elements["archive_auto_backup_frequency"]?.value || "daily_02:00";
    const retention = Number(form.elements["archive_backup_retention_count"]?.value) || 30;
    const threshold = Number(form.elements["archive_alert_threshold"]?.value) || 80;
    const autoArchive =
      form.elements["archive_auto_archive_enabled"]?.value === "true";
    if (button) {
      button.disabled = true;
    }
    try {
      await api.bulkUpdate({
        archive_auto_backup_frequency: frequency,
        archive_backup_retention_count: retention,
        archive_alert_threshold: threshold,
        archive_auto_archive_enabled: autoArchive,
      });
      if (feedback) feedback.textContent = "Đã lưu cấu hình.";
      AdminRuntime.toast("Cấu hình lưu trữ đã được cập nhật.", "success");
    } catch (error) {
      console.error("[quantri] saveArchiveConfig failed", error);
      if (feedback) feedback.textContent = "Không thể lưu cấu hình.";
      AdminRuntime.toast(resolveApiError(error), "error");
    } finally {
      if (button) {
        button.disabled = false;
      }
    }
  }

  function setSelectValue(id, value, fallback) {
    const el = document.getElementById(id);
    if (!el) return;
    if (value === undefined || value === null) {
      el.value = fallback || "";
      return;
    }
    el.value = String(value);
  }

  function handlePolicyEdit(policyId) {
    const policy = archiveState.policies.find((item) => String(item.policy_id) === String(policyId));
    if (!policy) return;
    const input = window.prompt("Thời hạn lưu trữ (năm)", policy.retention_years || "0");
    if (input === null) return;
    const retentionYears = Number.parseInt(input, 10);
    if (!Number.isFinite(retentionYears)) {
      AdminRuntime.toast("Thời hạn không hợp lệ.", "error");
      return;
    }
    window.ApiClient?.archive?.policies?.update?.(policy.policy_id, {
      retention_years: retentionYears,
    }).then(() => {
      AdminRuntime.toast("Đã cập nhật quy định.", "success");
      loadRetentionPolicies();
    }).catch((error) => {
      console.error("[quantri] update policy failed", error);
      AdminRuntime.toast(resolveApiError(error), "error");
    });
  }

  function handlePolicyReview(policyId) {
    const policy = archiveState.policies.find((item) => String(item.policy_id) === String(policyId));
    if (!policy) return;
    const defaultDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const input = window.prompt("Ngày rà soát mới (YYYY-MM-DD)", policy.next_review_at || defaultDate);
    if (!input) return;
    window.ApiClient?.archive?.policies?.review?.(policy.policy_id, {
      next_review_at: input,
    }).then(() => {
      AdminRuntime.toast("Đã đặt lịch rà soát.", "success");
      loadRetentionPolicies();
    }).catch((error) => {
      console.error("[quantri] review policy failed", error);
      AdminRuntime.toast(resolveApiError(error), "error");
    });
  }
  /* --------------------------- Thông báo & nhắc việc --------------------------- */
  function initThongBao() {
    const tabBtns = $$('[data-tab]');
    tabBtns.forEach((btn) =>
      btn.addEventListener("click", () => {
        tabBtns.forEach((b) => b.classList.toggle("is-active", b === btn));
        const tabId = btn.dataset.tab;
        $$('[id^="tab-"]').forEach((panel) => panel.classList.toggle("hidden", panel.id !== tabId));
      })
    );
    tabBtns[0]?.click();

    $$("[data-notify-toggle]").forEach((toggle) => {
      toggle.addEventListener("change", () => {
        const name = toggle.dataset.channel || "Kênh";
        AdminRuntime.toast(`${name}: ${toggle.checked ? "Bật" : "Tắt"} nhắc việc.`);
      });
    });
    if (window.ApiClient) {
      initThongBaoApi();
    }
  }

  async function initThongBaoApi() {
    const api = window.ApiClient;
    if (!api?.documents || !api?.workflowTransitions) {
      return;
    }
    try {
      const [docResp, transitionResp, notificationResp, reminderResp] = await Promise.all([
        api.documents.list({ ordering: "-created_at", page_size: 200 }),
        api.workflowTransitions.list({ ordering: "-updated_at", page_size: 40 }),
        api.notifications.list({ ordering: "-sent_at", page_size: 60 }),
        api.reminders.list({ ordering: "-due_at", page_size: 40 }),
      ]);
      const docs = api.extractItems(docResp);
      const transitions = api.extractItems(transitionResp);
      const notifications = api.extractItems(notificationResp);
      const reminders = api.extractItems(reminderResp);
      updateNotifTopMetrics(notifications);
      refreshChannelCards(notifications);
      renderAutomationRules(reminders);
      renderNotifLogs(notifications);
    } catch (error) {
      console.error("[quantri] initThongBaoApi failed", error);
    }
  }

  const NOTIF_CHANNELS = [
    { key: "email", label: "Thư điện tử", matcher: (channel) => channel === "email" },
    { key: "sms", label: "SMS", matcher: (channel) => channel === "sms" },
    { key: "app", label: "Ứng dụng", matcher: (channel) => channel === "app" },
  ];

  function getNotifChannel(notification) {
    return (notification.channel || "").toString().trim().toLowerCase();
  }

  function isNotifError(notification) {
    const statusText = (notification.status || "").toString().toLowerCase();
    return ["error", "fail", "reject", "ngưng"].some((hint) => statusText.includes(hint));
  }

  function setNotifMetric(id, value) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = value;
    }
  }

  function updateNotifTopMetrics(notifications) {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const recentNotifs = (notifications || []).filter((notif) => {
      const sentAt = Date.parse(notif.sent_at || "");
      return !Number.isNaN(sentAt) && sentAt >= thirtyDaysAgo;
    });
    const errorCount = (notifications || []).filter((notif) => isNotifError(notif)).length;
    const channelCount = NOTIF_CHANNELS.filter((channel) =>
      (notifications || []).some((notif) => channel.matcher(getNotifChannel(notif)))
    ).length;

    setNotifMetric("notifChannelsValue", `${channelCount}/${NOTIF_CHANNELS.length}`);
    setNotifMetric("notifChannelsText", `${channelCount} kênh có dữ liệu`);
    setNotifMetric("notifSentValue", recentNotifs.length.toLocaleString("vi-VN"));
    setNotifMetric("notifSentText", "Trong 30 ngày");
    setNotifMetric("notifErrorValue", errorCount.toLocaleString("vi-VN"));
    setNotifMetric("notifErrorText", "Lỗi ghi nhận từ hệ thống");
  }

  function refreshChannelCards(notifications) {
    const stats = {};
    NOTIF_CHANNELS.forEach((channel) => {
      const matched = (notifications || []).filter((notif) =>
        channel.matcher(getNotifChannel(notif))
      );
      const errorCount = matched.filter((notif) => isNotifError(notif)).length;
      const successCount = matched.length - errorCount;
      const rate = matched.length ? Math.round((successCount / matched.length) * 100) : 0;
      stats[channel.key] = {
        sent: matched.length,
        errors: errorCount,
        rate,
      };
      updateChannelCard(channel.key, stats[channel.key]);
    });
  }

  function updateChannelCard(key, { sent, errors, rate }) {
    const sentEl = document.querySelector(`[data-channel-sent="${key}"]`);
    const rateEl = document.querySelector(`[data-channel-rate="${key}"]`);
    const errorEl = document.querySelector(`[data-channel-error="${key}"]`);
    if (sentEl) {
      sentEl.textContent = sent.toLocaleString("vi-VN");
    }
    if (rateEl) {
      rateEl.textContent = `Tỷ lệ thành công ${rate}%`;
    }
    if (errorEl) {
      errorEl.textContent = errors ? `Lỗi ${errors}` : "Không lỗi";
    }
  }

  function renderAutomationRules(reminders) {
    const container = document.getElementById("notifAutomationList");
    if (!container) return;
    if (!reminders.length) {
      container.innerHTML =
        '<p class="text-sm text-slate-500">Chưa có quy tắc tự động hóa.</p>';
      return;
    }
    const entries = reminders.slice(0, 5).map((reminder) => {
      const entity = (reminder.entity_type || "unknown").toString();
      const status = reminder.status || "PENDING";
      const dueText = reminder.due_at ? formatDateTime(reminder.due_at) : "Chưa có";
      const lastNotified = reminder.last_notified_at
        ? formatDateTime(reminder.last_notified_at)
        : "Chưa chạy";
      const badgeClass = reminder.status === "SENT" ? "badge badge--green" : "badge badge--muted";
      const recipient = reminder.user_summary?.full_name || "Người dùng";
      return `<article class="border border-slate-200 rounded-xl p-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded-full text-[12px] bg-slate-100 text-slate-700">
                ${escapeHtml(entity)}
              </span>
              <span class="px-2 py-0.5 rounded-full text-[12px] bg-emerald-50 text-emerald-700">
                ${escapeHtml(status)}
              </span>
              <h4 class="font-semibold">Thông báo ${escapeHtml(entity)}</h4>
            </div>
            <p class="text-[12.5px] text-slate-500 mt-1">
              Gửi cho: ${escapeHtml(recipient)} • Hạn: ${escapeHtml(dueText)}
            </p>
            <div class="mt-2 text-[12px] text-slate-500">
              <span>Thông báo lần cuối: ${escapeHtml(lastNotified)}</span>
            </div>
          </div>
          <div class="text-[12px] text-slate-500 text-right">
            ${escapeHtml(status)}
          </div>
        </div>
      </article>`;
    });
    container.innerHTML = entries.join("");
  }

  function renderNotifLogs(notifications) {
    const container = document.getElementById("notifLogList");
    if (!container) return;
    if (!notifications.length) {
      container.innerHTML =
        '<p class="text-sm text-slate-500">Chưa có nhật ký gửi thông báo.</p>';
      return;
    }
    const entries = notifications
      .slice()
      .sort((a, b) => {
        const aTime = Date.parse(a.sent_at || "");
        const bTime = Date.parse(b.sent_at || "");
        return (bTime || 0) - (aTime || 0);
      })
      .slice(0, 4)
      .map((notif) => {
        const title = notif.title || "Thông báo";
        const channel = notif.channel || "khác";
        const time = formatDateTime(notif.sent_at);
        const status = notif.read_at ? "Đã đọc" : "Chưa đọc";
        const recipient =
          notif.user_summary?.full_name ||
          notif.user_summary?.username ||
          "Người nhận";
        let html = '<article class="border border-slate-200 rounded-xl p-4">';
        html += '<div class="flex items-start justify-between gap-4">';
        html += '<div>';
        html += '<div class="flex items-center gap-2">';
        html += '<span class="px-2 py-0.5 rounded-full text-[12px] bg-emerald-50 text-emerald-700">' + escapeHtml(channel) + '</span>';
        html += '<span class="px-2 py-0.5 rounded-full text-[12px] bg-slate-100 text-slate-700">' + escapeHtml(status) + '</span>';
        html += '<h4 class="font-semibold">' + escapeHtml(title) + '</h4>';
        html += '</div>';
        html += '<p class="text-[12.5px] text-slate-500 mt-1">Người nhận: ' + escapeHtml(recipient) + '</p>';
        html += '</div>';
        html += '<div class="text-[12px] text-slate-500 text-right">' + escapeHtml(time) + '</div>';
        html += '</div>';
        html += '</article>';
        return html;
      });
    container.innerHTML = entries.join('');
  }

  /* --------------------------- Báo cáo - thống kê --------------------------- */
    async function initThongKe() {
    console.log('[quantri] Initializing Reports & Analytics page');
    
    if (typeof window.initQuantriAnalytics === "function") {
      window.initQuantriAnalytics();
      return;
    }
    
    initReportTabs();
    
    const filterBtn = $("#btnFilter");
    const dateFrom = $("#dateFrom");
    const dateTo = $("#dateTo");
    const filterDept = $("#filterDept");
    
    filterBtn?.addEventListener("click", () => {
      const params = {
        date_from: dateFrom?.value,
        date_to: dateTo?.value,
        department_id: filterDept?.value !== "all" ? filterDept?.value : null
      };
      loadAnalytics(params);
    });
    
    const btnRefresh = $("#btnRefresh");
    if (btnRefresh) {
      btnRefresh.addEventListener("click", () => {
        const dateFrom = $("#dateFrom")?.value;
        const dateTo = $("#dateTo")?.value;
        const filterDept = $("#filterDept")?.value;
        loadAnalytics({
          date_from: dateFrom,
          date_to: dateTo,
          department_id: filterDept !== "all" ? filterDept : null
        });
      });
    }
    
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    if (dateFrom && !dateFrom.value) dateFrom.value = thirtyDaysAgo.toISOString().split('T')[0];
    if (dateTo && !dateTo.value) dateTo.value = today.toISOString().split('T')[0];
    
    await loadAnalytics();
  }

  function initReportTabs() {
    const tabBtns = $$(".tab-btn");
    const tabPanels = $$(".tab-panel");
    
    tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.dataset.tab;
        
        // Update button states
        tabBtns.forEach((b) => {
          b.classList.remove("text-blue-700", "border-blue-600");
          b.classList.add("text-slate-600");
          b.classList.remove("border-b-2");
        });
        btn.classList.add("text-blue-700", "border-b-2", "border-blue-600");
        btn.classList.remove("text-slate-600");
        
        // Show target panel
        tabPanels.forEach((panel) => {
          panel.classList.toggle("hidden", panel.id !== targetId);
        });
      });
    });
  }

  async function loadAnalytics(params = {}) {
    const loadingOverlay = $('#analyticsLoading');
    const refreshBtn = $('#btnRefresh');
    
    try {
      console.log('[quantri] Loading analytics data', params);
      
      // Show loading state
      if (loadingOverlay) loadingOverlay.classList.remove('hidden');
      if (refreshBtn) refreshBtn.disabled = true;
      
      // Build query string
      const queryParams = new URLSearchParams();
      if (params.date_from) queryParams.append('date_from', params.date_from);
      if (params.date_to) queryParams.append('date_to', params.date_to);
      if (params.department_id) queryParams.append('department_id', params.department_id);
      
      // Load dashboard KPIs
      const kpiResponse = await fetch(`/api/v1/analytics/dashboard?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}`
        }
      });
      
      if (!kpiResponse.ok) throw new Error('Failed to load KPIs');
      const kpiData = await kpiResponse.json();
      
      // Update KPI cards
      updateKPICards(kpiData.data);
      
      // Load charts data in parallel
      const [docsByType, timeline, priority, deptPerf, topUsers] = await Promise.all([
        fetchAnalytics('/api/v1/analytics/documents/by-type', params),
        fetchAnalytics('/api/v1/analytics/activity/timeline', { period: 'week', metric: 'documents' }),
        fetchAnalytics('/api/v1/analytics/documents/by-priority', {}),
        fetchAnalytics('/api/v1/analytics/performance/by-department', {}),
        fetchAnalytics('/api/v1/analytics/performance/top-users', { limit: 10 })
      ]);
      
      // Render all charts
      renderAnalyticsCharts({ docsByType, timeline, priority, deptPerf, topUsers });
      
      // Update document type table
      updateDocumentTypeTable(docsByType.data || []);
      
      // Update department performance table
      updateDepartmentTable(deptPerf.data || []);
      
      // Update top users table
      updateTopUsersTable(topUsers.data || []);
      
      console.log('[quantri] Analytics data loaded successfully');
      AdminRuntime.toast('Đã tải dữ liệu mới nhất', 'success');
      
    } catch (error) {
      console.error('[quantri] Failed to load analytics', error);
      AdminRuntime.toast('Không thể tải dữ liệu thống kê', 'error');
      // Fallback to old method
      updateReportCharts();
    } finally {
      // Hide loading state
      if (loadingOverlay) loadingOverlay.classList.add('hidden');
      if (refreshBtn) refreshBtn.disabled = false;
    }
  }

  async function fetchAnalytics(endpoint, params = {}) {
    const queryParams = new URLSearchParams(params);
    const response = await fetch(`${endpoint}?${queryParams}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}`
      }
    });
    if (!response.ok) throw new Error(`Failed to fetch ${endpoint}`);
    return response.json();
  }

  function updateKPICards(kpis) {
    // Update total documents
    const totalDocsEl = $('#kpiTotalDocs');
    if (totalDocsEl && kpis.total_documents) {
      totalDocsEl.textContent = formatNumber(kpis.total_documents.count);
      const growthEl = totalDocsEl.closest('article')?.querySelector('p');
      if (growthEl) {
        const rate = kpis.total_documents.growth_rate || 0;
        const sign = rate >= 0 ? '+' : '';
        growthEl.textContent = `${sign}${rate}% so với tháng trước`;
        growthEl.className = rate >= 0 ? 'text-[12.5px] text-emerald-600 mt-1' : 'text-[12.5px] text-rose-600 mt-1';
      }
    }
    
    // Update active users
    const section = document.querySelector('section.grid.grid-cols-1.md\\:grid-cols-4');
    if (section && kpis.active_users) {
      const cards = section.querySelectorAll('article');
      if (cards[1]) {
        const valueEl = cards[1].querySelector('.text-2xl.font-bold');
        if (valueEl) valueEl.textContent = `${kpis.active_users.active}/${kpis.active_users.total}`;
        const textEl = cards[1].querySelector('p');
        if (textEl) textEl.textContent = `${kpis.active_users.rate}% tỷ lệ hoạt động`;
      }
      
      // Processing efficiency
      if (cards[2] && kpis.processing_efficiency) {
        const valueEl = cards[2].querySelector('.text-2xl.font-bold');
        if (valueEl) valueEl.textContent = `${kpis.processing_efficiency.rate}%`;
      }
      
      // Overdue rate
      if (cards[3] && kpis.overdue_rate) {
        const valueEl = cards[3].querySelector('.text-2xl.font-bold');
        if (valueEl) {
          valueEl.textContent = `${kpis.overdue_rate.rate}%`;
          valueEl.className = 'text-2xl font-bold text-rose-600';
        }
      }
    }
  }

  function renderAnalyticsCharts({ docsByType, timeline, priority, deptPerf, topUsers }) {
    // Overview tab charts
    if (timeline?.data) {
      renderLineCanvas('chAccessDay', {
        labels: timeline.data.labels,
        datasets: timeline.data.datasets
      });
      
      renderBarCanvas('chWeekBars', {
        labels: timeline.data.labels,
        datasets: timeline.data.datasets
      });
    }
    
    // Documents tab charts
    if (priority?.data) {
      const priorityData = {
        labels: ['Khẩn cấp', 'Cao', 'Trung bình', 'Thấp'],
        datasets: [{
          data: [
            priority.data.URGENT || 0,
            priority.data.HIGH || 0,
            priority.data.MEDIUM || 0,
            priority.data.LOW || 0
          ]
        }]
      };
      renderBarCanvas('chPriority', priorityData, ['#ef4444', '#f97316', '#3b82f6', '#6b7280']);
    }
    
    if (timeline?.data) {
      renderLineCanvas('chDayLine', {
        labels: timeline.data.labels,
        datasets: timeline.data.datasets
      }, '#0f172a');
    }
    
    // Performance tab
    if (deptPerf?.data) {
      const deptData = {
        labels: deptPerf.data.map(d => d.department).slice(0, 5),
        datasets: [{
          label: 'Hiệu suất',
          data: deptPerf.data.map(d => d.efficiency).slice(0, 5)
        }]
      };
      renderBarCanvas('chPerfDept', deptData, ['#10b981', '#f97316']);
    }
    
    // Activity tab
    if (timeline?.data) {
      renderLineCanvas('chAccessDay2', {
        labels: timeline.data.labels,
        datasets: timeline.data.datasets
      }, '#a855f7');
      
      renderBarCanvas('chWeekBars2', {
        labels: timeline.data.labels,
        datasets: timeline.data.datasets
      }, ['#6d28d9', '#0ea5e9']);
    }
  }

  function updateDocumentTypeTable(data) {
    const tbody = document.querySelector('#tab-docs table tbody');
    if (!tbody || !data.length) return;
    
    tbody.innerHTML = data.map(item => `
      <tr>
        <td class="px-4 py-2">${escapeHtml(item.type_name)}</td>
        <td class="px-4 py-2 text-right">${formatNumber(item.total)}</td>
        <td class="px-4 py-2 text-right">${formatNumber(item.processed)}</td>
        <td class="px-4 py-2 text-right ${item.success_rate >= 90 ? 'text-emerald-600' : 'text-orange-600'}">
          ${item.success_rate.toFixed(1)}%
        </td>
        <td class="px-4 py-2 text-right">${item.avg_processing_days.toFixed(1)} ngày</td>
      </tr>
    `).join('');
  }

  function updateDepartmentTable(data) {
    const tbody = document.querySelector('#tab-perf table tbody');
    if (!tbody || !data.length) return;
    
    const rankEmojis = ['🥇', '#2', '#3', '#4', '#5'];
    tbody.innerHTML = data.slice(0, 5).map((item, idx) => `
      <tr>
        <td class="px-4 py-2">${escapeHtml(item.department)}</td>
        <td class="px-4 py-2 text-right">${formatNumber(item.doc_count)}</td>
        <td class="px-4 py-2 text-right ${item.efficiency >= 90 ? 'text-emerald-600' : 'text-orange-600'}">
          ${item.efficiency.toFixed(1)}%
        </td>
        <td class="px-4 py-2 text-right">${item.avg_time.toFixed(1)}</td>
        <td class="px-4 py-2 text-right">${rankEmojis[idx] || `#${idx + 1}`}</td>
      </tr>
    `).join('');
  }

  function updateTopUsersTable(data) {
    const tbody = document.querySelector('#tab-users table tbody');
    if (!tbody || !data.length) return;
    
    const rankEmojis = ['🥇', '#2', '#3', '#4', '#5'];
    const roleColors = {
      'Quản trị': 'bg-rose-50 text-rose-700',
      'Văn thư': 'bg-slate-100 text-slate-700',
      'Chuyên viê': 'bg-blue-50 text-blue-700',
      'Lãnh đạo': 'bg-violet-50 text-violet-700'
    };
    
    tbody.innerHTML = data.slice(0, 5).map((item, idx) => `
      <tr>
        <td class="px-4 py-2">${escapeHtml(item.user)}</td>
        <td class="px-4 py-2">
          <span class="px-2 py-0.5 rounded-full ${roleColors[item.role] || 'bg-slate-100 text-slate-700'} text-xs font-semibold">
            ${escapeHtml(item.role)}
          </span>
        </td>
        <td class="px-4 py-2 text-right">${formatNumber(item.processed_count)}</td>
        <td class="px-4 py-2 text-right ${item.efficiency >= 90 ? 'text-emerald-600' : 'text-orange-600'}">
          ${item.efficiency.toFixed(1)}%
        </td>
        <td class="px-4 py-2 text-right">${item.avg_time.toFixed(1)} ngày</td>
        <td class="px-4 py-2 text-right">${rankEmojis[idx] || `#${idx + 1}`}</td>
      </tr>
    `).join('');
  }

  async function exportReport(format) {
    try {
      const dateFrom = $("#dateFrom")?.value;
      const dateTo = $("#dateTo")?.value;
      
      const response = await fetch('/api/v1/analytics/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}`
        },
        body: JSON.stringify({
          format,
          filters: { date_from: dateFrom, date_to: dateTo }
        })
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const result = await response.json();
      AdminRuntime.toast(`Đang chuẩn bị file ${format}. Vui lòng đợi...`, 'success');
      
    } catch (error) {
      console.error('[quantri] Export failed', error);
      AdminRuntime.toast('Không thể xuất báo cáo', 'error');
    }
  }

  // Fallback function for old logic
  function updateReportCharts() {
    const api = window.ApiClient;
    if (!api) {
      renderReportCharts();
      return Promise.resolve();
    }
    return Promise.all([
      api.documents.list({ ordering: '-created_at', page_size: 52 }),
      api.cases.list({ ordering: '-created_at', page_size: 32 }),
    ])
      .then(([docResp, caseResp]) => {
        const docs = api.extractItems(docResp);
        const cases = api.extractItems(caseResp);
        const docMeta = api.extractPageMeta(docResp);
        const caseMeta = api.extractPageMeta(caseResp);
        updateTopCards(docMeta, docs, caseMeta, cases);
        renderReportCharts({
          accessLine: buildDayCounts(docs, 8),
          weekBars: buildDayCounts(docs, 6),
          priorityBars: buildPriorityCounts(docs),
          dayLine: buildDayCounts(docs, 7),
          perfBars: buildCaseStatusCounts(cases),
          accessLine2: buildDayCounts(docs, 5),
          weekBars2: buildDayCounts(docs, 4),
        });
      })
      .catch((error) => {
        console.error('[quantri] updateReportCharts failed', error);
        renderReportCharts();
      });
  }

  function updateTopCards(docMeta, docs, caseMeta, cases) {
    const container = document.querySelector('section.grid.grid-cols-1.md\:grid-cols-4');
    if (!container) return;
    const cards = Array.from(container.querySelectorAll('article'));
    const stats = buildTopStats(docMeta, docs, caseMeta, cases);
    cards.forEach((card, index) => {
      const valueEl = card.querySelector('.text-2xl.font-bold');
      const textEl = card.querySelector('p');
      if (valueEl && stats[index]) valueEl.textContent = stats[index].value;
      if (textEl && stats[index]) textEl.textContent = stats[index].text;
    });
  }

  function buildTopStats(docMeta, docs, caseMeta, cases) {
    const totalDocs = docMeta?.totalItems ?? docs.length;
    const totalCases = caseMeta?.totalItems ?? cases.length;
    const finishedDocs = docs.filter(isDocFinished).length;
    const inProgressCount = Math.max(0, docs.length - finishedDocs);
    const processingRate = docs.length ? Math.round((inProgressCount / docs.length) * 100) : 0;
    const overdueCount = computeOverdueCases(cases);
    const overduePercent = cases.length ? Math.round((overdueCount / cases.length) * 100) : 0;
    return [
      { value: totalDocs.toLocaleString('vi-VN'), text: 'Live API data' },
      { value: `${totalCases.toLocaleString('vi-VN')}`, text: `${cases.length} recent cases` },
      { value: `${processingRate}%`, text: `${inProgressCount}/${docs.length || 1} processing` },
      { value: `${overduePercent}%`, text: `${overdueCount}/${cases.length || 1} overdue` },
    ];
  }

  function isDocFinished(doc) {
    const status = (doc.status?.code || doc.status?.name || doc.status || '').toString().toLowerCase();
    return ['done', 'completed', 'published', 'archived', 'closed'].some((value) => status.includes(value));
  }

  function computeOverdueCases(cases) {
    const now = Date.now();
    return cases.reduce((count, item) => {
      const raw = item.due_date || item.dueDate || item.due || item.deadline || item.deadline_at;
      if (!raw) return count;
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return count;
      const status = (item.status?.code || item.status?.name || '').toString().toLowerCase();
      if (['done', 'completed', 'closed'].some((value) => status.includes(value))) return count;
      if (date.getTime() < now) return count + 1;
      return count;
    }, 0);
  }

  function buildDayCounts(items, days = 7) {
    const now = new Date();
    const buckets = [];
    const indexByKey = {};
    for (let i = days - 1; i >= 0; i -= 1) {
      const date = new Date(now);
      date.setDate(now.getDate() - i);
      const key = date.toISOString().slice(0, 10);
      indexByKey[key] = buckets.length;
      buckets.push(0);
    }
    items.forEach((item) => {
      const raw = item.created_at || item.createdAt || item.published_date || item.updated_at;
      if (!raw) return;
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return;
      const key = date.toISOString().slice(0, 10);
      if (key in indexByKey) buckets[indexByKey[key]] += 1;
    });
    return buckets;
  }

  function buildPriorityCounts(docs) {
    const buckets = { urgent: 0, high: 0, normal: 0, other: 0 };
    docs.forEach((doc) => {
      const key = (doc.urgencyKey || doc.urgency?.name || '').toString().toLowerCase();
      if (key.includes('ratkhan') || key.includes('urgent')) buckets.urgent += 1;
      else if (key.includes('khan') || key.includes('high')) buckets.high += 1;
      else if (key.includes('cao')) buckets.normal += 1;
      else buckets.other += 1;
    });
    return [buckets.urgent, buckets.high, buckets.normal, buckets.other];
  }

  function buildCaseStatusCounts(cases) {
    const buckets = { open: 0, processing: 0, pending: 0, done: 0 };
    cases.forEach((item) => {
      const status = (item.status?.code || item.status?.name || '').toString().toLowerCase();
      if (status.includes('processing') || status.includes('handling')) buckets.processing += 1;
      else if (status.includes('pending')) buckets.pending += 1;
      else if (status.includes('done') || status.includes('completed')) buckets.done += 1;
      else buckets.open += 1;
    });
    return [buckets.open, buckets.processing, buckets.pending, buckets.done];
  }

  function renderLineCanvas(id, values, color = '#2563eb') {
    const canvas = document.getElementById(id);
    if (!canvas?.getContext) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width || canvas.clientWidth || 320;
    const height = canvas.height || canvas.clientHeight || 120;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    if (!values.length) {
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(0, 0, width, height);
      return;
    }
    const max = Math.max(...values, 1);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((value, index) => {
      const x = (index / (values.length - 1 || 1)) * width;
      const y = height - (value / max) * height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function renderBarCanvas(id, values, palette = ['#2563eb', '#0f172a']) {
    const canvas = document.getElementById(id);
    if (!canvas?.getContext) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width || canvas.clientWidth || 320;
    const height = canvas.height || canvas.clientHeight || 120;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    if (!values.length) {
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(0, 0, width, height);
      return;
    }
    const max = Math.max(...values, 1);
    const gap = 8;
    const barWidth = (width - (values.length + 1) * gap) / values.length;
    values.forEach((value, index) => {
      const barHeight = (value / max) * height;
      ctx.fillStyle = palette[index % palette.length] || palette[0];
      ctx.fillRect(gap + index * (barWidth + gap), height - barHeight, barWidth, barHeight || 2);
    });
  }
  function initTaiKhoan() {
    const modalChange = initModal("#modalChangePass");
    const modalLogout = initModal("#modalLogout");
    const layout = window.Layout || {};
    const api = window.ApiClient || null;
    const displayName = document.getElementById("displayName");
    const displayUsername = document.getElementById("displayUsername");
    const displayDepartment = document.getElementById("displayDepartment");
    const displayCreatedAt = document.getElementById("displayCreatedAt");
    const displayLastLogin = document.getElementById("displayLastLogin");
    const avatar = document.getElementById("avatarInitials");
    const inputs = {
      name: document.getElementById("inpFullname"),
      email: document.getElementById("inpEmail"),
      username: document.getElementById("inpUsername"),
      code: document.getElementById("inpCode"),
      phone: document.getElementById("inpPhone"),
      department: document.getElementById("inpDept"),
      createdAt: document.getElementById("inpCreatedAt"),
      lastLogin: document.getElementById("inpLastLogin"),
    };
    const sessionTableBody = document.getElementById("sessionTableBody");
    const btnEditProfile = document.getElementById("btnEdit");
    const btnSaveProfile = document.getElementById("btnSave");
    const btnCancelEdit = document.getElementById("btnCancel");
    const editableInputs = [inputs.name, inputs.email, inputs.phone].filter(Boolean);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    let profileSnapshot = {};

    function captureSnapshot() {
      profileSnapshot = {};
      editableInputs.forEach((input) => {
        if (input && input.id) {
          profileSnapshot[input.id] = input.value;
        }
      });
    }

    function restoreSnapshot() {
      editableInputs.forEach((input) => {
        if (input && input.id && profileSnapshot.hasOwnProperty(input.id)) {
          input.value = profileSnapshot[input.id];
        }
      });
    }

    function setEditMode(on) {
      editableInputs.forEach((input) => {
        if (!input) return;
        input.disabled = !on;
        input.classList.toggle("bg-white", on);
        input.classList.toggle("bg-slate-50", !on);
      });
      btnEditProfile?.classList.toggle("hidden", on);
      btnSaveProfile?.classList.toggle("hidden", !on);
      btnCancelEdit?.classList.toggle("hidden", !on);
    }

    btnEditProfile?.addEventListener("click", () => {
      captureSnapshot();
      setEditMode(true);
      editableInputs[0]?.focus();
    });
    btnCancelEdit?.addEventListener("click", () => {
      restoreSnapshot();
      setEditMode(false);
      AdminRuntime.toast("Đã huỷ thay đổi.");
    });

    async function handleProfileSave() {
      const payload = {
        full_name: (inputs.name?.value || "").trim(),
        email: (inputs.email?.value || "").trim(),
        phone: (inputs.phone?.value || "").trim(),
      };
      if (!payload.full_name) {
        AdminRuntime.toast("Vui lòng nhập họ và tên.", "error");
        return;
      }
      if (payload.email && !emailRegex.test(payload.email)) {
        AdminRuntime.toast("Email không hợp lệ.", "error");
        return;
      }
      const apiClient = api;
      if (!apiClient || typeof apiClient.updateProfile !== "function") {
        AdminRuntime.toast("Không thể lưu thông tin lúc này.", "error");
        return;
      }
      const originalLabel = btnSaveProfile?.textContent || "Lưu thay đổi";
      btnSaveProfile.disabled = true;
      btnSaveProfile.textContent = "Đang lưu...";
      try {
        const updatedUser = await apiClient.updateProfile(payload);
        if (updatedUser) {
          layout.user = updatedUser;
          applyUserProfile(updatedUser);
        }
        AdminRuntime.toast("Đã lưu thông tin tài khoản.", "success");
        setEditMode(false);
      } catch (err) {
        const message =
          err?.data?.detail ||
          err?.message ||
          "Không thể lưu thông tin. Vui lòng thử lại.";
        AdminRuntime.toast(message, "error");
        setEditMode(true);
      } finally {
        btnSaveProfile.disabled = false;
        if (btnSaveProfile) {
          btnSaveProfile.textContent = originalLabel;
        }
      }
    }

    btnSaveProfile?.addEventListener("click", handleProfileSave);
    setEditMode(false);

    function deriveInitials(value) {
      const raw = (value || "").trim();
      if (!raw) {
        return "--";
      }
      const parts = raw.split(/\s+/).filter(Boolean);
      if (!parts.length) {
        return raw.slice(0, 2).toUpperCase();
      }
      if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
      }
      const first = parts[0][0] || "";
      const last = parts[parts.length - 1][0] || "";
      return (first + last).toUpperCase();
    }

    function formatDate(value) {
      if (!value) {
        return "";
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return "";
      }
      return date.toLocaleString("vi-VN");
    }

    function applyUserProfile(user) {
      if (!user || typeof user !== "object") {
        return;
      }
      const fullName = (user.full_name || user.name || "").trim();
      const username = (user.username || "").trim();
      const email = (user.email || "").trim();
      const phone = (user.phone || "").trim();
      const department = (user.department_name || user.department || "").trim();
      const code = (user.user_code || "").trim();
      const createdAt = formatDate(user.created_at);
      const lastLogin = formatDate(user.last_login);
      const initials =
        user.initials ||
        layout.userDisplay?.initials ||
        deriveInitials(fullName || username);

      if (displayName) {
        displayName.textContent = fullName || username || displayName.textContent;
      }
      if (displayUsername) {
        displayUsername.textContent = username
          ? `@${username}`
          : displayUsername.textContent;
      }
      if (displayDepartment && department) {
        displayDepartment.textContent = department;
      }
      if (displayCreatedAt && createdAt) {
        displayCreatedAt.textContent = createdAt;
      }
      if (displayLastLogin && lastLogin) {
        displayLastLogin.textContent = lastLogin;
      }
      if (avatar) {
        avatar.textContent = initials || "--";
      }

      if (inputs.name) {
        inputs.name.value = fullName || "";
      }
      if (inputs.email) {
        inputs.email.value = email || "";
      }
      if (inputs.username) {
        inputs.username.value = username ? `@${username}` : "";
      }
      if (inputs.code) {
        inputs.code.value = code || "";
      }
      if (inputs.phone) {
        inputs.phone.value = phone || "";
      }
      if (inputs.department) {
        inputs.department.value = department || "";
      }
      if (inputs.createdAt) {
        inputs.createdAt.value = createdAt || "";
      }
      if (inputs.lastLogin) {
        inputs.lastLogin.value = lastLogin || "";
      }
    }

    function renderSessionRows(records = []) {
      if (!sessionTableBody) return;
      const sessions = Array.isArray(records) ? records : [];
      if (!sessions.length) {
        sessionTableBody.innerHTML =
          '<tr><td colspan="7" class="py-6 text-center text-[13px] text-slate-500">Chưa có lịch sử phiên đăng nhập.</td></tr>';
        return;
      }
      const currentSession =
        api && typeof api.getSessionId === "function" ? api.getSessionId() : null;
      sessionTableBody.innerHTML = sessions
        .map((session) => {
          const sessionId = String(session.session_id || session.id || "");
          if (!sessionId) return "";
          const issued = formatDate(session.issued_at || session.issuedAt);
          const expires = formatDate(session.expires_at || session.expiresAt);
          const device = session.device || session.agent || session.user_agent || "Trình duyệt không xác định";
          const ip = session.ip || "—";
          const agent = session.user_agent || session.agent || "Trình duyệt";
          const revoked = Boolean(session.revoked);
          const isCurrent =
            currentSession && currentSession.toString() === sessionId.toString();
          const badgeClass = revoked
            ? "badge badge--rose"
            : isCurrent
            ? "badge badge--blue"
            : "badge badge--green";
          const badgeLabel = revoked
            ? "Đã thu hồi"
            : isCurrent
            ? "Phiên hiện tại"
            : "Hoạt động";
          const safeId = sessionId.replace(/["']/g, "");
          const actionButton =
            !revoked && !isCurrent
              ? `<button type="button" data-revoke-session="${safeId}" class="text-[13px] text-slate-900 hover:underline">Thu hồi</button>`
              : "";
          return `
            <tr class="hover:bg-slate-50/60">
              <td class="px-5 py-3 font-mono text-[12px]">${escapeHtml(sessionId)}</td>
              <td class="px-5 py-3">${escapeHtml(device)}</td>
              <td class="px-5 py-3">${escapeHtml(ip)}</td>
              <td class="px-5 py-3">${escapeHtml(issued || "—")}</td>
              <td class="px-5 py-3">${escapeHtml(expires || "—")}</td>
              <td class="px-5 py-3 text-slate-500 line-clamp-2">${escapeHtml(agent)}</td>
              <td class="px-5 py-3">
                <span class="${badgeClass}">${badgeLabel}</span>
                ${actionButton}
              </td>
            </tr>
          `;
        })
        .join("");
    }

    async function loadSessionsTable() {
      if (!sessionTableBody) return;
      if (!api || typeof api.listSessions !== "function") {
        sessionTableBody.innerHTML =
          '<tr><td colspan="7" class="py-6 text-center text-[13px] text-rose-600">Không thể tải dữ liệu phiên.</td></tr>';
        return;
      }
      sessionTableBody.innerHTML =
        '<tr><td colspan="7" class="py-6 text-center text-[13px] text-slate-500">Đang tải lịch sử phiên đăng nhập...</td></tr>';
      try {
        const records = await api.listSessions();
        renderSessionRows(records);
      } catch (err) {
        console.error("[quantri] loadSessionsTable failed", err);
        sessionTableBody.innerHTML =
          '<tr><td colspan="7" class="py-6 text-center text-[13px] text-rose-600">Không thể tải lịch sử phiên.</td></tr>';
      }
    }

    sessionTableBody?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-revoke-session]");
      if (!button) return;
      const sessionId = button.dataset.revokeSession;
      if (!sessionId || !api || typeof api.revokeSession !== "function") return;
      button.disabled = true;
      try {
        await api.revokeSession(sessionId);
        AdminRuntime.toast("Đã thu hồi phiên đăng nhập.");
        await loadSessionsTable();
      } catch (err) {
        const message =
          err?.data?.detail || err?.message || "Không thể thu hồi phiên đăng nhập.";
        AdminRuntime.toast(message);
      } finally {
        button.disabled = false;
      }
    });

    applyUserProfile(layout.user);
    if (typeof layout.ensureUser === "function") {
      layout
        .ensureUser()
        .then((user) => {
          if (user) {
            applyUserProfile(user);
          }
        })
        .catch(() => {});
    }

    $("#btnChangePass")?.addEventListener("click", () => modalChange.open());
    $("#btnLogoutAll")?.addEventListener("click", () => modalLogout.open());

    modalChange.form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const current = form.querySelector('[name="current_password"]')?.value?.trim() || "";
      const pass = form.querySelector('[name="new_password"]').value.trim();
      const confirm = form.querySelector('[name="confirm_password"]').value.trim();
      const logContext = {
        hasCurrent: Boolean(current),
        newPasswordLength: pass.length,
      };

      if (pass !== confirm) {
        AdminRuntime.toast("Mật khẩu không khớp.");
        return;
      }
      if (!api || typeof api.changePassword !== "function") {
        AdminRuntime.toast("Không thể đổi mật khẩu lúc này.");
        return;
      }
      const submitBtn = modalChange.form?.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        console.info("[quantri] changePassword payload", logContext);
        await api.changePassword({
          current_password: current,
          new_password: pass,
          new_password_confirm: confirm,
        });
        AdminRuntime.toast("Đã đổi mật khẩu. Vui lòng đăng nhập lại.");
        form.reset();
        modalChange.close();
      } catch (err) {
        console.error("[quantri] changePassword failed", err);
        const message =
          err?.data?.detail ||
          err?.message ||
          "Không thể đổi mật khẩu. Vui lòng thử lại.";
        AdminRuntime.toast(message);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    modalLogout.form?.addEventListener("submit", (event) => {
      event.preventDefault();
      AdminRuntime.toast("Đã đăng xuất khỏi toàn bộ thiết bị.");
      modalLogout.close();
    });

    loadSessionsTable();
    layout.setupLogoutHandler?.();
  }



  // ===============================================
  // NOTIFICATIONS & REMINDERS PAGE
  // ===============================================




  const notificationAdminState = {
    channels: [],
    stats: null,
    rules: [],
  };

  const getAuthToken = () =>
    window.ApiClient?.getAccessToken?.() ||
    sessionStorage.getItem("htvb.accessToken") ||
    localStorage.getItem("htvb.accessToken") ||
    localStorage.getItem("access_token") ||
    "";

  async function requestJson(path, options = {}) {
    const api = window.ApiClient;
    if (api?.request) {
      return api.request(path, options);
    }
    const headers = new Headers(options.headers || {});
    const token = getAuthToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    if (
      options.body &&
      !(options.body instanceof FormData) &&
      !headers.has("Content-Type")
    ) {
      headers.set("Content-Type", "application/json");
    }
    const init = {
      ...options,
      headers,
    };
    const response = await fetch(path, init);
    if (response.status === 204) return null;
    if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
  }

  function updateNotificationKpis() {
      // Stub for KPI updates
      console.log('[quantri] updateNotificationKpis called');
  }

  function initThongBaoNhacViec() {
    console.log('[quantri] Init Notifications page');
    loadAutomationRules();
    loadNotificationLogs();
  }


  async function loadAutomationRules() {
    try {
      const payload = await requestJson(
        "/api/v1/notifications/automation-rules/"
      );
      const rules = payload?.data || payload?.results || [];
      notificationAdminState.rules = Array.isArray(rules) ? rules : [];
      const container = document.getElementById('notifAutomationList');
      if (!container) return;
      
      if (notificationAdminState.rules.length === 0) {
        container.innerHTML = '<p class="text-sm text-slate-500">Chưa có quy tắc tự động nào</p>';
        updateNotificationKpis();
        return;
      }

      container.innerHTML = notificationAdminState.rules.map(rule => `
        <article class="rounded-xl border border-slate-200 p-4">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1">
              <h4 class="font-semibold">${escapeHtml(rule.name)}</h4>
              <div class="flex items-center gap-3 text-[12.5px] text-slate-500 mt-1">
                <span>Sự kiện: ${escapeHtml(rule.trigger_display)}</span>
                <span>•</span>
                <span>Kênh: ${rule.channels.join(', ')}</span>
              </div>
            </div>
            <span class="inline-flex px-2 py-1 rounded-full text-[12px] font-semibold ${
              rule.is_enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
            }">
              ${rule.is_enabled ? 'Hoạt động' : 'Tạm dừng'}
            </span>
          </div>
        </article>
      `).join('');
      updateNotificationKpis();
    } catch (error) {
      console.error("[quantri] loadAutomationRules failed", error);
      const container = document.getElementById('notifAutomationList');
      if (container) container.innerHTML = '<p class="text-sm text-rose-600">Không thể tải dữ liệu</p>';
    }
  }

  async function loadNotificationLogs() {
    try {
      const payload = await requestJson("/api/v1/notifications/logs/?page=1");
      const logs = extractLogItems(payload);
      const container = document.getElementById('notifLogList');
      if (!container) return;
      
      if (logs.length === 0) {
        container.innerHTML = '<p class="text-sm text-slate-500">Chưa có nhật ký gửi</p>';
        return;
      }

      container.innerHTML = logs.map((log) => {
        const statusClass = log.status === 'sent' 
          ? 'bg-emerald-50 text-emerald-700'
          : log.status === 'failed'
          ? 'bg-rose-50 text-rose-700'
          : 'bg-amber-50 text-amber-700';
        
        const timeAgo = formatTimeAgo(log.sent_at);

        return `
          <article class="rounded-xl border border-slate-200 p-4">
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${statusClass}">
                    ${escapeHtml(log.status_display || log.status || '')}
                  </span>
                  <span class="text-[12px] text-slate-500">${escapeHtml(log.channel)}</span>
                </div>
                <h4 class="font-medium text-[14px]">${escapeHtml(log.title)}</h4>
                <p class="text-[12.5px] text-slate-500 mt-1">
                  Gửi tới: ${escapeHtml(log.recipient)}
                  ${log.error_message ? `<br><span class="text-rose-600">Lỗi: ${escapeHtml(log.error_message)}</span>` : ''}
                </p>
              </div>
              <div class="text-right text-[12px] text-slate-500">${timeAgo}</div>
            </div>
          </article>
        `;
      }).join('');
    } catch (error) {
      console.error("[quantri] loadNotificationLogs failed", error);
      const container = document.getElementById('notifLogList');
      if (container) container.innerHTML = '<p class="text-sm text-rose-600">Không thể tải nhật ký</p>';
    }
  }

  function extractLogItems(payload) {
    if (!payload) return [];
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.results)) return payload.results;
    if (Array.isArray(payload?.results?.data)) return payload.results.data;
    if (Array.isArray(payload?.data?.results)) return payload.data.results;
    return Array.isArray(payload) ? payload : [];
  }

  function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Vừa xong";
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 30) return `${diffDays} ngày trước`;
    return date.toLocaleDateString("vi-VN");
  }

  function initQuanLyHeThong() {
    console.log("[quantri] Init System Management page");
    wireDashboardActions();
  }

  // Export global shortcuts
  window.AdminRuntime = window.AdminRuntime || {};
  window.AdminRuntime.initThongBaoNhacViec = initThongBaoNhacViec;
  window.AdminRuntime.initDanhMuc = initDanhMuc;

})();
