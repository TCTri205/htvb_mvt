/* ============================================================
   layout.js
   Nạp header/sidebar/footer dùng partials + binding dữ liệu mô phỏng
   Hoạt động thuần front-end, hỗ trợ mở file qua HTTP server hoặc file://
============================================================ */

(function () {
  const ROLE_CONFIG = {
    chuyenvien: {
      user: {
        name: "Nguyễn Văn An",
        roleName: "Chuyên viên",
        department: "Phòng Hành chính",
        initials: "NVA",
      },
      counters: { notifications: 3, messages: 1 },
      navLabel: "Điều hướng nghiệp vụ",
      nav: [
        navItem("dashboard", "/chuyenvien/dashboard.html", "Trang chủ", ["dashboard", "dashboard-chuyenvien"]),
        navItem("vanbanden", "/chuyenvien/vanbanden.html", "Văn bản đến", ["vanbanden", "vanbanden-detail", "vanbanden-tiepnhan"]),
        navItem("vanbandi", "/chuyenvien/vanbandi.html", "Văn bản đi", ["vanbandi", "vanbandi-detail", "vanbandi-taomoi"]),
        navItem("hosocongviec", "/chuyenvien/hosocongviec.html", "Hồ sơ công việc", ["hosocongviec", "hosocongviec-detail", "hosocongviec-taomoi"]),
        navItem("baocaothongke", "/chuyenvien/baocaothongke.html", "Báo cáo & Thống kê"),
        navItem("thongbaonhacviec", "/chuyenvien/thongbaonhacviec.html", "Thông báo - Nhắc việc"),
        navItem("danhmuc", "/chuyenvien/danhmuc.html", "Danh mục"),
        navItem("taikhoan", "/chuyenvien/taikhoan.html", "Tài khoản"),
      ],
    },
    lanhdao: {
      user: {
        name: "Trần Thị Bình",
        roleName: "Lãnh đạo",
        department: "Văn phòng Chủ tịch",
        initials: "TTB",
      },
      counters: { notifications: 3, messages: 1 },
      navLabel: "Điều hướng lãnh đạo",
      nav: [
        navItem("dashboard", "/lanhdao/dashboard.html", "Trang chủ", ["dashboard", "dashboard-lanhdao"]),
        navItem("vanbanden", "/lanhdao/vanbanden.html", "Văn bản đến", ["vanbanden", "vanbanden-detail"]),
        navItem("vanbandi", "/lanhdao/vanbandi.html", "Văn bản đi", ["vanbandi", "vanbandi-detail"]),
        navItem("hosocongviec", "/lanhdao/hosocongviec.html", "Hồ sơ công việc", ["hosocongviec", "hosocongviec-detail", "hosocongviec-taomoi"]),
        navItem("baocaothongke", "/lanhdao/baocaothongke.html", "Báo cáo & Thống kê"),
        navItem("thongbaonhacviec", "/lanhdao/thongbaonhacviec.html", "Thông báo - Nhắc việc"),
        navItem("danhmuc", "/lanhdao/danhmuc.html", "Danh mục"),
        navItem("taikhoan", "/lanhdao/taikhoan.html", "Tài khoản"),
      ],
    },
    vanthu: {
      user: {
        name: "Lê Văn Cường",
        roleName: "Văn thư",
        department: "Văn phòng UBND",
        initials: "LVC",
      },
      counters: { notifications: 3, messages: 1 },
      navLabel: "Điều hướng văn thư",
      nav: [
        navItem("dashboard", "/vanthu/dashboard.html", "Trang chủ", ["dashboard", "dashboard-vanthu"]),
        navItem("vanbanden", "/vanthu/vanbanden.html", "Văn bản đến", ["vanbanden", "vanbanden-detail", "vanbanden-tiepnhan"]),
        navItem("sodangky", "/vanthu/sodangky.html", "Sổ đăng ký", ["sodangky"]),
        navItem("vanbandi", "/vanthu/vanbandi.html", "Văn bản đi", ["vanbandi", "vanbandi-detail", "vanbandi-taomoi"]),
        navItem("hosocongviec", "/vanthu/hosocongviec.html", "Hồ sơ công việc", ["hosocongviec", "hosocongviec-detail"]),
        navItem("baocaothongke", "/vanthu/baocaothongke.html", "Báo cáo & Thống kê"),
        navItem("thongbaonhacviec", "/vanthu/thongbaonhacviec.html", "Thông báo - Nhắc việc"),
        navItem("danhmuc", "/vanthu/danhmuc.html", "Danh mục"),
        navItem("taikhoan", "/vanthu/taikhoan.html", "Tài khoản"),
      ],
    },
    quantri: {
      user: {
        name: "Phạm Thị Dung",
        roleName: "Quản trị",
        department: "Phòng Tin học",
        initials: "PTD",
      },
      counters: { notifications: 3, messages: 1 },
      navLabel: "Điều hướng quản trị",
      nav: [
        navItem("dashboard", "/quantri/dashboard.html", "Trang chủ", ["dashboard", "dashboard-quantri"]),
        navItem("nguoidung", "/quantri/nguoidung.html", "Người dùng", ["nguoidung", "nguoidung-detail"]),
        navItem("phanquyen", "/quantri/phanquyen.html", "Phân quyền", ["phanquyen", "phanquyen-detail"]),
        navItem("danhmuchethong", "/quantri/danhmuchethong.html", "Danh mục hệ thống", ["danhmuchethong", "danhmuchethong-detail"]),
        navItem("hosoluutru", "/quantri/hosoluutru.html", "Hồ sơ & Lưu trữ"),
        navItem("thongkebaocao", "/quantri/thongkebaocao.html", "Thống kê & Báo cáo"),
        navItem("thongbaonhacviec", "/quantri/thongbaonhacviec.html", "Thông báo - Nhắc việc"),
        navItem("quanlyhethong", "/quantri/quanlyhethong.html", "Quản lý hệ thống"),
        navItem("cauhinh", "/quantri/cauhinh.html", "Cấu hình quy trình", ["cauhinh"]),
        navItem("taikhoan", "/quantri/taikhoan.html", "Tài khoản"),
      ],
    },
    template: {
      user: {
        name: "Nguyễn Văn An",
        roleName: "Chuyên viên",
        department: "Phòng Hành chính",
        initials: "NVA",
      },
      counters: { notifications: 3, messages: 1 },
      navLabel: "Điều hướng mẫu",
      nav: [
        navItem("dashboard", "dashboard.html", "Trang chủ"),
        navItem("module-a", "#", "Module A"),
        navItem("module-b", "#", "Module B"),
        navItem("module-c", "#", "Module C"),
      ],
    },
  };

  const FALLBACKS = {
    header: `
<header class="fixed inset-x-0 top-0 z-50 bg-white border-b border-slate-200" data-partial="header">
  <div class="h-14 flex items-center px-4 md:px-6">
    <button
      id="btnSidebar"
      class="md:hidden grid place-items-center w-9 h-9 rounded-full hover:bg-slate-100"
      aria-label="Mở/đóng điều hướng"
      aria-expanded="false"
      type="button"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-slate-700" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" />
      </svg>
    </button>
    <div class="flex items-center gap-3">
      <div class="shrink-0 w-8 h-8 rounded-md bg-blue-600/90 grid place-items-center text-white text-sm font-bold">
        UB
      </div>
      <div class="leading-tight">
        <p class="text-[13px] font-semibold uppercase tracking-wide">
          Hệ thống quản lý văn bản &amp; điều hành
        </p>
        <p class="text-[12px] text-slate-500 -mt-0.5">
          Phường Thanh Khê Đông
        </p>
      </div>
    </div>
    <div class="flex-1 hidden md:flex justify-center pl-6 pr-4">
      <label class="relative w-full max-w-2xl">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M8 4a4 4 0 102.83 6.83l3.44 3.44a1 1 0 001.41-1.41l-3.44-3.44A4 4 0 008 4zm-6 4a6 6 0 1110.89 3.476l3.817 3.817a3 3 0 11-4.243 4.243l-3.817-3.817A6 6 0 012 8z"
            clip-rule="evenodd"
          />
        </svg>
        <input
          id="globalSearch"
          type="search"
          class="w-full h-10 pl-10 pr-4 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-500 text-[14px] placeholder-slate-400"
          placeholder="Tìm kiếm văn bản, hồ sơ..."
          aria-label="Tìm kiếm"
        />
      </label>
    </div>
    <div class="ml-auto flex items-center gap-2 md:gap-4">
      <button
        id="notifBtn"
        type="button"
        class="relative grid place-items-center w-9 h-9 rounded-full hover:bg-slate-100"
        aria-label="Thông báo"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-slate-600" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 2a6 6 0 00-6 6v2.586l-.707 1.414A1 1 0 006.172 14H18a1 1 0 00.879-1.476L18 10.586V8a6 6 0 00-6-6z"
          />
          <path d="M8 16a4 4 0 008 0H8z" />
        </svg>
        <span
          class="absolute -top-0.5 -right-0.5 px-1.5 text-[11px] leading-5 rounded-full bg-rose-600 text-white font-medium"
          data-counter="notifications"
        >
          0
        </span>
      </button>
      <button
        id="msgBtn"
        type="button"
        class="relative grid place-items-center w-9 h-9 rounded-full hover:bg-slate-100"
        aria-label="Tin nhắn"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-slate-600" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 3C6.477 3 2 6.686 2 11c0 1.982.842 3.81 2.26 5.23-.13.94-.51 2.346-1.572 3.408a.75.75 0 00.53 1.282c2.15-.119 3.63-.74 4.59-1.297A11.79 11.79 0 0012 19c5.523 0 10-3.686 10-8s-4.477-8-10-8z"
          />
        </svg>
        <span
          class="absolute -top-0.5 -right-0.5 px-1.5 text-[11px] leading-5 rounded-full bg-rose-600 text-white font-medium"
          data-counter="messages"
        >
          0
        </span>
      </button>
      <div class="hidden md:flex items-center gap-3 pl-2">
        <div
          class="w-9 h-9 rounded-full bg-blue-600 text-white grid place-items-center text-xs font-semibold"
          data-user-field="initials"
        >
          --
        </div>
        <div class="leading-tight text-right">
          <div class="text-[13px] font-medium" data-user-field="name">--</div>
          <div class="text-[12px] text-slate-500" data-user-field="roleName">--</div>
        </div>
      </div>
    </div>
  </div>
</header>
    `.trim(),
    sidebar: `
<aside id="sidebar" class="sidebar hidden md:flex md:flex-col w-64 shrink-0" data-partial="sidebar">
  <div class="sidebar__profile">
    <div class="font-semibold leading-5" data-user-field="name">--</div>
    <div class="text-[13px] text-blue-600" data-user-field="roleName">--</div>
    <div class="text-[12px] text-slate-500" data-user-field="department">--</div>
  </div>
  <nav class="sidebar__nav" data-role-nav></nav>
  <div class="sidebar__footer">
    &copy; UBND Phường Thanh Khê Đông<br />
    Phiên bản 1.0
  </div>
</aside>
    `.trim(),
    footer: `
<footer class="border-t border-slate-200 bg-white text-center text-[12.5px] text-slate-500 py-3" data-partial="footer">
  &copy; UBND Phường Thanh Khê Đông · Phiên bản 1.0
</footer>
    `.trim(),
  };

  const body = document.body || document.documentElement;
  const normalizedRoot = normalizeRoot(body?.dataset?.root || ".");
  const api = window.ApiClient || null;
  if (api && typeof api.init === "function") {
    api.init();
  }
  const requireAuth = body?.dataset?.requireAuth !== "false";
  const explicitLoginAttr = body?.dataset?.loginPath || "";
  let loginPath = resolvePath(normalizedRoot, "login.html");
  if (explicitLoginAttr) {
    const trimmed = explicitLoginAttr.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      loginPath = trimmed;
    } else if (trimmed.startsWith("/")) {
      loginPath = trimmed.replace(/\/+/g, "/");
    } else {
      loginPath = resolvePath(normalizedRoot, trimmed);
    }
  }
  let authPromise = Promise.resolve(null);
  const explicitRole = (body?.dataset?.role || "").toLowerCase();
  const inferredRole = explicitRole || detectRoleFromPath();
  const resolvedRole = ROLE_CONFIG[inferredRole] ? inferredRole : "chuyenvien";

  if (body) {
    body.dataset.root = normalizedRoot;
    if (!body.dataset.role) {
      body.dataset.role = resolvedRole;
    }
  }

  const placeholders = {
    header: document.querySelector('[data-include="header"]'),
    sidebar: document.querySelector('[data-include="sidebar"]'),
    footer: document.querySelector('[data-include="footer"]'),
  };
  const pendingPartials = Object.entries(placeholders)
    .filter(([, el]) => el)
    .map(([name]) => name);

  const Layout = {
    role: resolvedRole,
    root: normalizedRoot,
    isReady: false,
    api,
    loginPath,
    requireAuth,
    user: null,
    roleConfig: null,
    fallbackUser: null,
    roleConfigApplied: false,
    whenReady: registerReadyHandler,
    ensureUser: () => authPromise,
  };
  const readyQueue = [];
  window.Layout = Layout;
  Layout.redirectToLogin = redirectToLogin;
  Layout.setupLogoutHandler = setupLogoutHandler;

  const loadPromise = pendingPartials.length ? loadPartials(pendingPartials) : Promise.resolve();

  authPromise = setupAuth();
  Layout.authPromise = authPromise;

  loadPromise
    .then(() => {
      applyRoleData(resolvedRole);
      return authPromise.catch((err) => {
        if (requireAuth) {
          throw err;
        }
        return null;
      });
    })
    .then(() => {
      if (Layout.user) {
        const inferred = deriveRoleFromUser(Layout.user);
        if (inferred && inferred !== Layout.role) {
          applyRoleData(inferred);
        }
        applyUser(Layout.user, Layout.fallbackUser);
      }
      setupLogoutHandler();
      finalizeLayout(null);
    })
    .catch((error) => {
      console.error("[layout] Khởi tạo layout thất bại:", error);
      if (!Layout.roleConfigApplied) {
        applyRoleData(resolvedRole);
      }
      setupLogoutHandler();
      finalizeLayout(error);
    });

  /* ============== Helpers ============== */

  function navItem(slug, href, label, matches) {
    return {
      slug,
      href,
      label,
      matches: matches || [],
    };
  }

  function registerReadyHandler(fn) {
    if (typeof fn !== "function") return;
    if (Layout.isReady) {
      try {
        fn();
      } catch (err) {
        console.error("[layout] Lỗi khi chạy callback ready:", err);
      }
      return;
    }
    readyQueue.push(fn);
  }

  function flushReadyQueue() {
    Layout.isReady = true;
    while (readyQueue.length) {
      const cb = readyQueue.shift();
      try {
        cb();
      } catch (err) {
        console.error("[layout] Lỗi khi thực thi callback:", err);
      }
    }
  }

  function finalizeLayout(error) {
    flushReadyQueue();
    window.dispatchEvent(
      new CustomEvent("layout:ready", {
        detail: {
          role: Layout.role,
          error: error || null,
        },
      })
    );
  }

  function loadPartials(names) {
    return Promise.all(
      names.map((name) =>
        loadPartial(name)
          .then((html) => ({ name, html }))
          .catch((err) => {
            console.warn(`[layout] Dùng fallback cho partial "${name}":`, err);
            return { name, html: FALLBACKS[name] || "" };
          })
      )
    ).then((results) => {
      results.forEach(({ name, html }) => {
        if (!html) return;
        injectPartial(name, html);
      });
    });
  }

  function loadPartial(name) {
    const path = resolvePath(normalizedRoot, `partials/${name}.html`);
    if (typeof fetch !== "function") {
      return Promise.reject(new Error("Fetch API không khả dụng"));
    }
    return fetch(path, { cache: "no-cache" }).then((res) => {
      if (!res.ok) {
        throw new Error(`Không tải được partial ${name} (${res.status})`);
      }
      return res.text();
    });
  }

  function injectPartial(name, html) {
    const target = placeholders[name];
    if (!target) return;
    target.outerHTML = html;
  }

  function setupLogoutHandler() {
    const btn = document.querySelector("[data-action='logout']");
    if (!btn || btn.dataset.logoutBound === "1") {
      return;
    }
    btn.dataset.logoutBound = "1";
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      const confirmMessage = btn.dataset.logoutConfirm;
      const shouldConfirm = confirmMessage !== "" && confirmMessage !== undefined;
      if (shouldConfirm) {
        const message = confirmMessage || "Bạn có chắc muốn đăng xuất?";
        if (!window.confirm(message)) {
          return;
        }
      }

      const finalizeLogout = () => {
        Layout.user = null;
        Layout.userDisplay = null;
        Layout.roleConfigApplied = false;
        window.location.href = "/";
      };

      const performLogout = () => {
        if (api && typeof api.logout === "function") {
          return api.logout();
        }
        if (api && typeof api.clearAuth === "function") {
          api.clearAuth();
        }
        return null;
      };

      try {
        Promise.resolve(performLogout())
          .catch((err) => {
            console.warn("[layout] Lỗi khi thực hiện logout:", err);
          })
          .finally(finalizeLogout);
      } catch (err) {
        console.warn("[layout] Lỗi khi thực hiện logout:", err);
        finalizeLogout();
      }
    });
  }

  function setupAuth() {
    if (!api) {
      return Promise.resolve(null);
    }

    const accessToken = typeof api.getAccessToken === "function" ? api.getAccessToken() : null;
    const cachedUser = typeof api.getCurrentUser === "function" ? api.getCurrentUser() : null;

    if (requireAuth && !accessToken) {
      redirectToLogin();
      return Promise.reject(new Error("UNAUTHENTICATED"));
    }

    if (cachedUser) {
      Layout.user = cachedUser;
      return Promise.resolve(cachedUser);
    }

    if (!requireAuth || typeof api.getMe !== "function") {
      return Promise.resolve(null);
    }

    return api
      .getMe()
      .then((user) => {
        Layout.user = user;
        return user;
      })
      .catch((err) => {
        console.warn("[layout] Không thể lấy thông tin người dùng:", err);
        redirectToLogin();
        throw err;
      });
  }

  function redirectToLogin() {
    const target = loginPath || "login.html";
    const current = (window.location.pathname || "").toLowerCase();
    if (current.endsWith("login.html") || current.endsWith("/login")) {
      return;
    }
    try {
      window.location.replace(target);
    } catch (err) {
      window.location.href = target;
    }
  }

  const ROLE_ALIAS = {
    CHUYEN_VIEN: "chuyenvien",
    CV: "chuyenvien",
    LANH_DAO: "lanhdao",
    LD: "lanhdao",
    VAN_THU: "vanthu",
    VT: "vanthu",
    QUAN_TRI: "quantri",
    QT: "quantri",
  };

  function deriveRoleFromUser(user) {
    if (!user || typeof user !== "object") {
      return null;
    }
    const raw =
      (user.role || user.roleName || user.role_name || user.role_name?.toString?.()) ||
      "";
    const normalized = String(raw || "")
      .trim()
      .replace(/\s+/g, "_")
      .toUpperCase();
    return ROLE_ALIAS[normalized] || null;
  }

  function applyRoleData(roleKey) {
    const config = ROLE_CONFIG[roleKey] || ROLE_CONFIG.chuyenvien;
    Layout.role = roleKey;
    Layout.roleConfig = config;
    Layout.fallbackUser = config.user || {};
    Layout.roleConfigApplied = true;
    applyUser(Layout.user, Layout.fallbackUser);
    applyCounters(config.counters);
    buildSidebarNav(config.nav, config.navLabel);
    if (body) {
      body.dataset.role = roleKey;
    }
  }

  function applyUser(user, fallback) {
    const fallbackData = fallback || {};
    const actual = user && typeof user === "object" ? user : null;

    const display = {
      name: fallbackData.name || "--",
      full_name: fallbackData.full_name || fallbackData.name || "",
      username: fallbackData.username || "",
      email: fallbackData.email || "",
      roleName: fallbackData.roleName || fallbackData.role || "",
      department: fallbackData.department || "",
      initials: fallbackData.initials || "",
    };

    if (actual) {
      if (actual.full_name) {
        display.full_name = actual.full_name;
      }
      display.name =
        actual.full_name ||
        actual.name ||
        display.name ||
        actual.username ||
        "--";
      display.username = actual.username || display.username;
      display.email = actual.email || display.email;
      display.roleName = actual.roleName || actual.role || display.roleName;
      display.department =
        actual.department_name ||
        actual.department ||
        display.department;
      display.initials = actual.initials || display.initials;
    }

    if (!display.initials) {
      display.initials = deriveInitials(display.name || display.full_name || display.username);
    }

    Layout.user = actual;
    Layout.userDisplay = display;

    document.querySelectorAll("[data-user-field]").forEach((el) => {
      const key = el.dataset.userField;
      if (!key) return;
      let value = display[key];
      if (value == null || value === "") {
        if (key === "initials") {
          value = deriveInitials(display.name || display.full_name || display.username);
        } else if (key === "name" && display.full_name) {
          value = display.full_name;
        }
      }
      el.textContent = value ? String(value) : "--";
    });
  }

  function deriveInitials(value) {
    if (!value) {
      return "--";
    }
    const source = String(value).trim();
    if (!source) {
      return "--";
    }
    const parts = source.split(/\s+/).filter(Boolean);
    if (!parts.length) {
      return source.slice(0, 2).toUpperCase();
    }
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    const first = parts[0][0] || "";
    const last = parts[parts.length - 1][0] || "";
    return (first + last).toUpperCase();
  }

  function applyCounters(counters) {
    const defaults = { notifications: 0, messages: 0 };
    const data = Object.assign({}, defaults, counters || {});
    document.querySelectorAll("[data-counter]").forEach((el) => {
      const key = el.dataset.counter;
      if (!(key in data)) return;
      el.textContent = String(data[key]);
    });
  }

  function buildSidebarNav(items, label) {
    const nav = document.querySelector("[data-role-nav]");
    if (!nav) return;
    nav.innerHTML = "";
    if (label) {
      nav.setAttribute("aria-label", label);
    } else if (!nav.getAttribute("aria-label")) {
      nav.setAttribute("aria-label", "Điều hướng");
    }

    const entries = [];
    items.forEach((item) => {
      if (!item) return;
      const link = document.createElement("a");
      link.className = "sidebar__link";
      link.href = item.href;

      const text = document.createElement("span");
      text.textContent = item.label || item.slug || "";

      link.append(text);
      nav.appendChild(link);
      entries.push({ link, config: item });
    });

    markActiveNav(entries);
  }

  function markActiveNav(entries) {
    if (!entries.length) return;
    const keys = collectCurrentKeys();
    let matched = false;
    entries.forEach(({ link, config }) => {
      if (matched) return;
      if (isNavMatch(config, keys)) {
        link.classList.add("is-active");
        matched = true;
      }
    });
    if (!matched) {
      entries[0].link.classList.add("is-active");
    }
  }

  function collectCurrentKeys() {
    const keys = new Set();
    const pageAttr = (document.body?.dataset?.page || "").toLowerCase();
    const slug = getSlug(location.pathname || "");
    pushKeys(keys, pageAttr);
    pushKeys(keys, slug);
    return Array.from(keys);
  }

  function pushKeys(store, raw) {
    if (!raw) return;
    store.add(raw);
    raw
      .split(/[\s_\-]+/)
      .filter(Boolean)
      .forEach((part) => store.add(part));
  }

  function isNavMatch(item, keys) {
    const slug = (item.slug || deriveSlug(item.href)).toLowerCase();
    const pool = new Set([slug]);
    (item.matches || []).forEach((m) => m && pool.add(m.toLowerCase()));
    for (const key of keys) {
      if (pool.has(key)) return true;
      for (const candidate of pool) {
        if (key.startsWith(candidate) || candidate.startsWith(key)) {
          return true;
        }
      }
    }
    return false;
  }

  function deriveSlug(href) {
    if (!href) return "";
    const clean = href.replace(/^[./]+/, "");
    return clean.split("/").pop()?.replace(/\.html.*$/i, "") || "";
  }

  function getSlug(pathname) {
    if (!pathname) return "";
    const clean = pathname.split("/").pop() || "";
    return clean.replace(/\.html.*$/i, "").toLowerCase();
  }

  function normalizeRoot(value) {
    if (!value) return ".";
    const trimmed = value.trim().replace(/\\/g, "/");
    if (!trimmed || trimmed === "." || trimmed === "./") return ".";
    return trimmed.replace(/\/+$/, "");
  }

  function resolvePath(root, relative) {
    if (!root || root === ".") return relative;
    return `${root.replace(/\/+$/, "")}/${relative}`.replace(/\/+/g, "/");
  }

  function detectRoleFromPath() {
    const path = (location.pathname || "").toLowerCase();
    const candidates = Object.keys(ROLE_CONFIG).filter((key) => key !== "template");
    for (const key of candidates) {
      if (path.includes(`/${key}/`)) return key;
    }
    return "";
  }
})();
