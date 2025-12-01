/* =====================================================================
   api.js
   Lightweight client for integrating the static frontend with the
   Django REST backend (JWT auth, auto refresh, generic fetch wrapper).
   ===================================================================== */

(function (global) {
  const DEFAULT_BASE_URL = (function () {
    if (global.API_BASE_URL) {
      return global.API_BASE_URL.trim();
    }
    if (typeof global.location === "object" && global.location.origin) {
      return global.location.origin;
    }
    return "http://localhost:8000";
  })().replace(/\/+$/, "");

  const ACCESS_KEY = "htvb.accessToken";
  const REFRESH_KEY = "htvb.refreshToken";
  const USER_KEY = "htvb.authUser";
  const REMEMBER_KEY = "htvb.remember";
  const ACCESS_COOKIE_NAME = "htvb_access";
  const SESSION_ID_KEY = "htvb.sessionId";
  const ACCESS_COOKIE_MAX_AGE = 60 * 60;
  const canUseDocument = typeof document !== "undefined";
  const canUseLocation = typeof location !== "undefined";

  const listeners = new Set();
  let baseUrl = DEFAULT_BASE_URL;
  let refreshPromise = null;

  function safeStorage(name) {
    try {
      return global[name];
    } catch (_) {
      return null;
    }
  }

  const session = safeStorage("sessionStorage");
  const local = safeStorage("localStorage");

  function bootstrapSession() {
    if (!session || !local) {
      return;
    }
    if (session.getItem(ACCESS_KEY)) {
      return;
    }
    if (local.getItem(ACCESS_KEY)) {
      session.setItem(ACCESS_KEY, local.getItem(ACCESS_KEY));
      session.setItem(REFRESH_KEY, local.getItem(REFRESH_KEY));
      session.setItem(USER_KEY, local.getItem(USER_KEY));
    }
  }

  bootstrapSession();

  function setBaseUrl(url) {
    if (typeof url !== "string") {
      return;
    }
    const trimmed = url.trim();
    if (!trimmed) {
      return;
    }
    baseUrl = trimmed.replace(/\/+$/, "");
  }

  function rememberPreference() {
    if (!local) {
      return false;
    }
    return local.getItem(REMEMBER_KEY) === "1";
  }

  function notifyAuth(state) {
    const detail = {
      isAuthenticated: Boolean(state && state.accessToken),
      accessToken: state ? state.accessToken || null : null,
      refreshToken: state ? state.refreshToken || null : null,
      user: state ? state.user || null : null,
    };
    try {
      global.dispatchEvent(new CustomEvent("auth:changed", { detail }));
    } catch (err) {
      console.warn("[api] Không thể phát sự kiện auth:changed:", err);
    }
    listeners.forEach((fn) => {
      try {
        fn(detail);
      } catch (err) {
        console.error("[api] Lỗi khi chạy listener auth:", err);
      }
    });
  }

  function serializeUser(user) {
    if (!user) {
      return null;
    }
    try {
      return JSON.stringify(user);
    } catch (err) {
      console.warn("[api] Không thể serialize user:", err);
      return null;
    }
  }

  function setAccessTokenCookie(token) {
    if (!canUseDocument) {
      return;
    }
    if (!token) {
      document.cookie = `${ACCESS_COOKIE_NAME}=; path=/; max-age=0`;
      return;
    }
    const secure = canUseLocation && location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${ACCESS_COOKIE_NAME}=${encodeURIComponent(token)}; path=/${secure}; SameSite=Lax; max-age=${ACCESS_COOKIE_MAX_AGE}`;
  }

  function storeSessionId(sessionId, remember) {
    const persist = Boolean(remember);
    if (session) {
      if (sessionId) {
        session.setItem(SESSION_ID_KEY, sessionId);
      } else {
        session.removeItem(SESSION_ID_KEY);
      }
    }
    if (local) {
      if (persist && sessionId) {
        local.setItem(SESSION_ID_KEY, sessionId);
      } else {
        local.removeItem(SESSION_ID_KEY);
      }
    }
  }

  function getStoredSessionId() {
    if (session && session.getItem(SESSION_ID_KEY)) {
      return session.getItem(SESSION_ID_KEY);
    }
    if (local && local.getItem(SESSION_ID_KEY)) {
      return local.getItem(SESSION_ID_KEY);
    }
    return null;
  }

  function getSessionId() {
    return getStoredSessionId();
  }

  function storeAuth({ access, refresh, user, sessionId }, remember) {
    const userString = serializeUser(user);
    if (session) {
      if (access) {
        session.setItem(ACCESS_KEY, access);
      } else {
        session.removeItem(ACCESS_KEY);
      }
      if (refresh) {
        session.setItem(REFRESH_KEY, refresh);
      } else {
        session.removeItem(REFRESH_KEY);
      }
      if (userString) {
        session.setItem(USER_KEY, userString);
      } else {
        session.removeItem(USER_KEY);
      }
    }
    if (sessionId !== undefined) {
      storeSessionId(sessionId, remember);
    }
    setAccessTokenCookie(access);
    if (local) {
      const keep = Boolean(remember);
      if (keep) {
        if (access) {
          local.setItem(ACCESS_KEY, access);
        }
        if (refresh) {
          local.setItem(REFRESH_KEY, refresh);
        }
        if (userString) {
          local.setItem(USER_KEY, userString);
        }
        local.setItem(REMEMBER_KEY, "1");
      } else {
        local.removeItem(ACCESS_KEY);
        local.removeItem(REFRESH_KEY);
        local.removeItem(USER_KEY);
        local.removeItem(REMEMBER_KEY);
      }
    }
    notifyAuth({
      accessToken: access || null,
      refreshToken: refresh || null,
      user: user || null,
    });
  }

  function parseStoredUser(raw) {
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.warn("[api] Không thể parse user lưu trữ:", err);
      return null;
    }
  }

  function getAccessToken() {
    return (session && session.getItem(ACCESS_KEY)) || (local && local.getItem(ACCESS_KEY)) || null;
  }

  function getRefreshToken() {
    return (session && session.getItem(REFRESH_KEY)) || (local && local.getItem(REFRESH_KEY)) || null;
  }

  function getStoredUser() {
    const raw = (session && session.getItem(USER_KEY)) || (local && local.getItem(USER_KEY)) || null;
    return parseStoredUser(raw);
  }

  function buildUrl(path, params) {
    let url;

    if (!path) {
      url = baseUrl;
    } else if (/^https?:\/\//i.test(path)) {
      url = path;
    } else if (path.startsWith("/")) {
      url = `${baseUrl}${path}`;
    } else {
      url = `${baseUrl}/${path}`;
    }

    if (!params || typeof params !== "object") {
      return url;
    }
    const query = toQuery(params);
    if (!query) {
      return url;
    }
    return `${url.replace(/\?$/, "")}${query}`;
  }

  function prepareRequestOptions(options) {
    const opts = Object.assign({}, options || {});
    const headers = new Headers(opts.headers || {});
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }

    let body = opts.body;
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
    const isBlob =
      typeof Blob !== "undefined" &&
      (body instanceof Blob || body instanceof ArrayBuffer || ArrayBuffer.isView(body));

    if (
      body &&
      typeof body === "object" &&
      !isFormData &&
      !isBlob &&
      typeof body.pipe !== "function"
    ) {
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      body = JSON.stringify(body);
    }

    const method = (opts.method || (body ? "POST" : "GET")).toUpperCase();

    const init = {
      method,
      headers,
      body: body || undefined,
      mode: opts.mode || "cors",
      cache: opts.cache || "no-cache",
      credentials: "omit",
    };

    const retryInit = () => {
      const newHeaders = new Headers(headers);
      const cloned = {
        method,
        headers: newHeaders,
        mode: init.mode,
        cache: init.cache,
        credentials: init.credentials,
      };
      if (body) {
        cloned.body = body;
      }
      return cloned;
    };

    return { init, retryInit };
  }

  async function parseResponse(response) {
    if (response.status === 204) {
      return null;
    }
    const contentType = response.headers.get("Content-Type") || "";
    if (!contentType) {
      try {
        const text = await response.text();
        return text || null;
      } catch (_) {
        return null;
      }
    }
    if (contentType.includes("application/json")) {
      try {
        return await response.json();
      } catch (err) {
        console.warn("[api] Không thể parse JSON:", err);
        return null;
      }
    }
    try {
      const text = await response.text();
      return text || null;
    } catch (err) {
      console.warn("[api] Không thể đọc response:", err);
      return null;
    }
  }

  async function refreshAccessToken() {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      return null;
    }

    if (!refreshPromise) {
      refreshPromise = (async () => {
        const url = buildUrl("/api/v1/auth/jwt/refresh/");
        let response;
        try {
          response = await fetch(url, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ refresh: refreshToken }),
            mode: "cors",
            credentials: "omit",
          });
        } catch (err) {
          console.error("[api] Lỗi khi gọi refresh token:", err);
          clearAuth();
          return null;
        }

        let data = null;
        try {
          data = await response.json();
        } catch (err) {
          data = null;
        }

        if (!response.ok || !data || !data.access) {
          clearAuth();
          return null;
        }

        const user = getStoredUser();
        const remember = rememberPreference();
        storeAuth(
          {
            access: data.access,
            refresh: refreshToken,
            user,
          },
          remember
        );
        return data.access;
      })().finally(() => {
        refreshPromise = null;
      });
    }

    try {
      return await refreshPromise;
    } catch (err) {
      console.error("[api] Refresh token thất bại:", err);
      return null;
    }
  }

  function clearAuth() {
    setAccessTokenCookie(null);
    storeAuth({ access: null, refresh: null, user: null, sessionId: null }, false);
  }

  function toQuery(params) {
    if (!params || typeof params !== "object") {
      return "";
    }
    const parts = [];
    Object.keys(params).forEach((key) => {
      const value = params[key];
      if (value === undefined || value === null || value === "") {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item === undefined || item === null || item === "") return;
          parts.push(
            `${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`
          );
        });
        return;
      }
      parts.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
      );
    });
    if (!parts.length) {
      return "";
    }
    return `?${parts.join("&")}`;
  }


  function extractItems(payload) {
    if (!payload) {
      return [];
    }
    if (Array.isArray(payload.items)) {
      return payload.items;
    }
    if (Array.isArray(payload.results)) {
      return payload.results;
    }
    if (Array.isArray(payload)) {
      return payload;
    }
    return [];
  }

  function extractPageMeta(payload) {
    const items = extractItems(payload);
    const totalItems =
      typeof payload?.total_items === "number" ? payload.total_items : items.length;
    const pageSize =
      typeof payload?.page_size === "number" && payload.page_size > 0
        ? payload.page_size
        : items.length || 1;
    const page =
      typeof payload?.page === "number" && payload.page > 0 ? payload.page : 1;
    const totalPages =
      typeof payload?.total_pages === "number" && payload.total_pages > 0
        ? payload.total_pages
        : pageSize > 0
        ? Math.max(1, Math.ceil(totalItems / pageSize))
        : 1;
    return {
      totalItems,
      totalPages,
      page,
      pageSize,
    };
  }

  async function request(path, options) {
    const requestOptions = options || {};
    const { params, ...restOptions } = requestOptions;
    const url = buildUrl(path, params);
    const { init, retryInit } = prepareRequestOptions(restOptions);
    const skipAuth = Boolean(restOptions && restOptions.skipAuth);

    if (!skipAuth) {
      const token = getAccessToken();
      if (token) {
        init.headers.set("Authorization", `Bearer ${token}`);
      }
    }

    let response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      const networkError = new Error("Không thể kết nối tới máy chủ.");
      networkError.cause = err;
      throw networkError;
    }

    if (response.status === 401 && !skipAuth) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        const retryOptions = retryInit();
        retryOptions.headers.set("Authorization", `Bearer ${newToken}`);
        response = await fetch(url, retryOptions);
      }
    }

    const payload = await parseResponse(response);
    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && typeof payload.detail === "string"
          ? payload.detail
          : "Yêu cầu thất bại.";
      const error = new Error(message);
      error.status = response.status;
      error.data = payload;
      if (payload && typeof payload.code === "string") {
        error.code = payload.code;
      }
      if (payload && payload.field_errors && typeof payload.field_errors === "object") {
        error.fieldErrors = payload.field_errors;
      }
      throw error;
    }
    return payload;
  }

  async function login(username, password, remember) {
    const payload = {
      username: String(username || "").trim(),
      password: String(password || ""),
    };
    const data = await request("/api/v1/auth/jwt/create/", {
      method: "POST",
      body: payload,
      skipAuth: true,
    });

    if (!data || !data.access || !data.refresh) {
      throw new Error("Không nhận được token từ máy chủ.");
    }

    const user = data.user || null;
    storeAuth(
      {
        access: data.access,
        refresh: data.refresh,
        user,
        sessionId: data.session_id || null,
      },
      Boolean(remember)
    );
    return {
      access: data.access,
      refresh: data.refresh,
      user,
    };
  }

  async function getMe() {
    const data = await request("/api/v1/auth/me/", { method: "GET" });
    if (!data) {
      return null;
    }
    const remember = rememberPreference();
    storeAuth(
      {
        access: getAccessToken(),
        refresh: getRefreshToken(),
        user: data,
      },
      remember
    );
    return data;
  }

  async function updateProfile(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("Dữ liệu cập nhật không hợp lệ.");
    }
    console.debug("[api] updateProfile payload:", payload);
    try {
      const response = await request("/api/v1/auth/me/", {
        method: "PATCH",
        body: payload,
      });
      console.debug("[api] updateProfile response:", response);
      const remember = rememberPreference();
      storeAuth(
        {
          access: getAccessToken(),
          refresh: getRefreshToken(),
          user: response,
        },
        remember
      );
      return response;
    } catch (err) {
      console.error("[api] updateProfile failed:", err);
      throw err;
    }
  }

  async function changePassword(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("Dữ liệu đổi mật khẩu không hợp lệ.");
    }
    console.debug("[api] changePassword payload:", payload);
    try {
      const response = await request("/api/v1/auth/change-password/", {
        method: "POST",
        body: payload,
      });
      console.debug("[api] changePassword succeeded", response);
      return response;
    } catch (err) {
      console.error("[api] changePassword failed:", err);
      throw err;
    }
  }

  async function listSessions() {
    const response = await request("/api/v1/auth/sessions/", { method: "GET" });
    return Array.isArray(response) ? response : [];
  }

  async function revokeSession(sessionId) {
    if (!sessionId) {
      throw new Error("Thiếu session_id");
    }
    await request(`/api/v1/auth/sessions/${encodeURIComponent(sessionId)}/`, {
      method: "DELETE",
    });
  }


  async function logout(options) {
    const cfg = options || {};
    const endpoint = cfg.endpoint === undefined ? "/auth/logout/" : cfg.endpoint;

    if (endpoint) {
      try {
        await request(endpoint, { method: "POST" });
      } catch (err) {
        if (!err || (err.status !== 404 && err.status !== 405)) {
          console.warn("[api] Không thể gọi logout endpoint:", err);
        }
      }
    }

    clearAuth();
  }

  function onAuthChanged(callback) {
    if (typeof callback !== "function") {
      return function noop() {};
    }
    listeners.add(callback);
    return function unsubscribe() {
      listeners.delete(callback);
    };
  }

  async function ensureAuthenticated() {
    const token = getAccessToken();
    if (!token) {
      return false;
    }
    try {
      await getMe();
      return true;
    } catch (err) {
      console.warn("[api] Không thể xác thực người dùng hiện tại:", err);
      clearAuth();
      return false;
    }
  }

  const registerBookApi = {
    list(params) {
      return request(buildUrl("/api/v1/register-books/", params), {
        method: "GET",
      });
    },
    create(payload) {
      return request("/api/v1/register-books/", {
        method: "POST",
        body: payload,
      });
    },
    update(id, payload, method = "PATCH") {
      if (!id) throw new Error("Thiếu register_id");
      return request(`/api/v1/register-books/${id}/`, {
        method,
        body: payload,
      });
    },
    remove(id) {
      if (!id) throw new Error("Thiếu register_id");
      return request(`/api/v1/register-books/${id}/`, { method: "DELETE" });
    },
    import(formData) {
      return request("/api/v1/register-books/import/", {
        method: "POST",
        body: formData,
      });
    },
    export(params) {
      return request(buildUrl("/api/v1/register-books/export/", params), {
        method: "GET",
      });
    },
  };

  const numberingRuleApi = {
    list(params) {
      return request(buildUrl("/api/v1/numbering-rules/", params), {
        method: "GET",
      });
    },
    create(payload) {
      return request("/api/v1/numbering-rules/", {
        method: "POST",
        body: payload,
      });
    },
    update(id, payload, method = "PATCH") {
      if (!id) throw new Error("Thiếu rule_id");
      return request(`/api/v1/numbering-rules/${id}/`, {
        method,
        body: payload,
      });
    },
    remove(id) {
      if (!id) throw new Error("Thiếu rule_id");
      return request(`/api/v1/numbering-rules/${id}/`, { method: "DELETE" });
    },
  };

  const documentTemplateApi = {
    list(params) {
      return request(buildUrl("/api/v1/document-templates/", params), {
        method: "GET",
      });
    },
    create(payload) {
      return request("/api/v1/document-templates/", {
        method: "POST",
        body: payload,
      });
    },
    update(id, payload, method = "PATCH") {
      if (!id) throw new Error("Thiếu template_id");
      return request(`/api/v1/document-templates/${id}/`, {
        method,
        body: payload,
      });
    },
    remove(id) {
      if (!id) throw new Error("Thiếu template_id");
      return request(`/api/v1/document-templates/${id}/`, {
        method: "DELETE",
      });
    },
  };

  const notificationApi = {
    list(params) {
      return request(buildUrl("/api/v1/notifications/", params), { method: "GET" });
    },
  };

  const reminderApi = {
    list(params) {
      return request(buildUrl("/api/v1/reminders/", params), { method: "GET" });
    },
  };

  const workflowTransitionApi = {
    list(params) {
      return request(buildUrl("/api/v1/workflow-transitions/", params), {
        method: "GET",
      });
    },
    create(payload) {
      return request("/api/v1/workflow-transitions/", {
        method: "POST",
        body: payload,
      });
    },
    update(id, payload, method = "PATCH") {
      if (!id) throw new Error("Thiếu transition_id");
      return request(`/api/v1/workflow-transitions/${id}/`, {
        method,
        body: payload,
      });
    },
    remove(id) {
      if (!id) throw new Error("Thiếu transition_id");
      return request(`/api/v1/workflow-transitions/${id}/`, {
        method: "DELETE",
      });
    },
  };

  
  function ensureDocumentId(value) {
    const raw = value || "";
    const str = String(raw).trim();
    if (!str) {
      throw new Error("Thiếu document_id");
    }
    return encodeURIComponent(str);
  }

  function ensureEntityId(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      return parsed;
    }
    throw new Error("Thiếu entity_id hợp lệ");
  }

  function buildDocumentSubUrl(documentId, suffix) {
    const encoded = ensureDocumentId(documentId);
    const cleanSuffix = (suffix || "")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
    const base = `/api/v1/documents/${encoded}`;
    return cleanSuffix ? `${base}/${cleanSuffix}/` : `${base}/`;
  }

  const DIRECTION_ALIASES = {
    INBOUND: "INBOUND",
    DEN: "INBOUND",
    DOC_IN: "INBOUND",
    OUTBOUND: "OUTBOUND",
    DI: "OUTBOUND",
    DOC_OUT: "OUTBOUND",
    DRAFT: "DRAFT",
    DU_THAO: "DRAFT",
  };

  function normalizeDirection(value) {
    if (!value) {
      return undefined;
    }
    const key = String(value).trim().toUpperCase();
    return DIRECTION_ALIASES[key] || undefined;
  }

  function serializeList(value) {
    if (value == null) {
      return undefined;
    }
    if (Array.isArray(value)) {
      return value
        .map((item) => String(item || "").trim())
        .filter((item) => Boolean(item))
        .join(",");
    }
    if (typeof value === "string") {
      return value;
    }
    return String(value);
  }

  function buildDocumentListParams(filters) {
    const params = {};
    const src = filters || {};
    const direction = normalizeDirection(src.direction || src.doc_direction);
    if (direction) {
      params.direction = direction;
    }
    const kind = src.kind;
    if (kind) {
      params.kind = Array.isArray(kind) ? kind.join(",") : kind;
    }
    const statusParam = serializeList(src.status ?? src.status__in);
    if (statusParam) {
      params.status = statusParam;
    }
    const include = serializeList(src.include);
    if (include) {
      params.include = include;
    }
    const aliasMap = {
      department_id: "department_id",
      assignee_id: "assignee_id",
      assigned_to: "assigned_to",
      created_by: "created_by",
      q: "q",
      page: "page",
      page_size: "page_size",
      ordering: "ordering",
      received_date_from: "received_date_from",
      received_date_to: "received_date_to",
      issued_date_from: "issued_date_from",
      issued_date_to: "issued_date_to",
      date_from: "date_from",
      date_to: "date_to",
      has_attachments: "has_attachments",
      mine: "mine",
      security_level: "security_level",
      urgency_level: "urgency_level",
    };
    Object.entries(aliasMap).forEach(([key, target]) => {
      const val = src[key];
      if (val !== undefined && val !== null && val !== "") {
        params[target] = val;
      }
    });
    return params;
  }

  const documentApi = {
    list(filters) {
      return request(buildUrl("/api/v1/documents/", buildDocumentListParams(filters)));
    },
    create(payload) {
      return request("/api/v1/documents/", {
        method: "POST",
        body: payload,
      });
    },
    update(id, payload) {
      if (!id) {
        throw new Error("Thiếu document_id");
      }
      return request(buildDocumentSubUrl(id), {
        method: "PATCH",
        body: payload,
      });
    },
    listInbound(filters) {
      return this.list({ ...(filters || {}), direction: "INBOUND" });
    },
    listOutbound(filters) {
      return this.list({ ...(filters || {}), direction: "OUTBOUND" });
    },
    listDrafts(filters) {
      return this.list({ ...(filters || {}), direction: "DRAFT" });
    },
    retrieve(id, params) {
      return request(buildUrl(`/api/v1/documents/${ensureDocumentId(id)}/`, params));
    },
    workflowLogs(id) {
      return request(buildDocumentSubUrl(id, "workflow-logs"));
    },
    assignments(id) {
      return request(buildDocumentSubUrl(id, "assignments"));
    },
    updateAssignments(id, payload) {
      return request(buildDocumentSubUrl(id, "assignments"), {
        method: "PUT",
        body: payload,
      });
    },
    approvals(id) {
      return request(buildDocumentSubUrl(id, "approvals"));
    },
    updateApprovals(id, payload) {
      return request(buildDocumentSubUrl(id, "approvals"), {
        method: "PUT",
        body: payload,
      });
    },
    versions(id) {
      return request(buildDocumentSubUrl(id, "versions"));
    },
    createVersion(id, payload) {
      return request(buildDocumentSubUrl(id, "versions"), {
        method: "POST",
        body: payload,
      });
    },
    attachments(id, options) {
      return request(buildDocumentSubUrl(id, "attachments"), options || {});
    },
    uploadAttachment(id, formData) {
      return request(buildDocumentSubUrl(id, "attachments"), {
        method: "POST",
        body: formData,
      });
    },
    deleteAttachment(id, attachmentId) {
      if (!attachmentId) {
        throw new Error("Thiếu attachment_id");
      }
      const cleanAttachment = encodeURIComponent(String(attachmentId));
      return request(buildDocumentSubUrl(id, `attachments/${cleanAttachment}`), {
        method: "DELETE",
      });
    },
    attachmentDownloadUrl(id, attachmentId) {
      if (!attachmentId) {
        throw new Error("Thiếu attachment_id");
      }
      const cleanAttachment = encodeURIComponent(String(attachmentId));
      return buildUrl(buildDocumentSubUrl(id, `attachments/${cleanAttachment}/download`));
    },
    finalizeRegistration(id, payload) {
      return request(`/api/v1/inbound-docs/${ensureDocumentId(id)}/finalize-registration/`, {
        method: "POST",
        body: payload,
      });
    },
    dispatchResult(id, payload) {
      return request(`/api/v1/inbound-docs/${ensureDocumentId(id)}/dispatch/`, {
        method: "POST",
        body: payload,
      });
    },
    archiveInbound(id, payload) {
      return request(`/api/v1/inbound-docs/${ensureDocumentId(id)}/archive/`, {
        method: "POST",
        body: payload,
      });
    },
    dispatches(id) {
      return request(buildDocumentSubUrl(id, "dispatches"));
    },
    createDispatch(id, payload) {
      return request(buildDocumentSubUrl(id, "dispatches"), {
        method: "POST",
        body: payload,
      });
    },
    submit(id, payload) {
      return dispatchDocumentAction("vanbandi", "submit", id, payload);
    },
    import(payload, options = {}) {
      const direction = normalizeDirection(options.direction) || "INBOUND";
      const endpoint = buildUrl("/api/v1/documents/import/", { direction });
      return request(endpoint, {
        method: "POST",
        body: payload,
      });
    },
    export(params) {
      const filters = buildDocumentListParams(params);
      return request(buildUrl("/api/v1/documents/export/", filters));
    },
  };

  const commentsApi = {
    list(params) {
      const entityType = params?.entity_type || params?.entityType;
      const entityIdRaw = params?.entity_id ?? params?.entityId;
      if (!entityType || entityIdRaw === undefined || entityIdRaw === null || entityIdRaw === "") {
        return Promise.reject(new Error("Thiếu entity_type hoặc entity_id để tải trao đổi."));
      }
      const entityId = ensureEntityId(entityIdRaw);
      return request(buildUrl("/api/v1/comments/", { entity_type: entityType, entity_id: entityId }));
    },
    create(payload) {
      if (!payload) {
        return Promise.reject(new Error("Thiếu dữ liệu gửi trao đổi."));
      }
      const entityType = payload.entity_type || payload.entityType;
      const entityIdRaw = payload.entity_id ?? payload.entityId;
      const content = payload.content || payload.note || payload.comment;
      if (!entityType || entityIdRaw === undefined || entityIdRaw === null || entityIdRaw === "") {
        return Promise.reject(new Error("Thiếu entity_type hoặc entity_id khi gửi trao đổi."));
      }
      if (!content || !String(content).trim()) {
        return Promise.reject(new Error("Nội dung trao đổi không được rỗng."));
      }
      const entityId = ensureEntityId(entityIdRaw);
      return request("/api/v1/comments/", {
        method: "POST",
        body: { entity_type: entityType, entity_id: entityId, content },
      });
    },
    delete(commentId) {
      if (commentId === undefined || commentId === null || commentId === "") {
        return Promise.reject(new Error("Thiếu comment_id để xóa."));
      }
      const cleanId = encodeURIComponent(String(commentId));
      return request(`/api/v1/comments/${cleanId}/`, { method: "DELETE" });
    },
  };

  function mapOutboundAction(action) {
    switch (action) {
      case "reject":
        return "return";
      case "recall":
        return "withdraw";
      default:
        return action;
    }
  }

  function dispatchDocumentAction(route, action, id, payload) {
    if (!id) {
      return Promise.reject(new Error("Thiếu document_id"));
    }
    const dispatcher = window.WorkflowActionDispatcher;
    if (!dispatcher || typeof dispatcher.submit !== "function") {
      return Promise.reject(
        new Error("WorkflowActionDispatcher không khả dụng. Hãy chắc chắn form MVT đã được hiển thị.")
      );
    }
    dispatcher.submit(route, id, mapOutboundAction(action), payload);
    return Promise.resolve();
  }

  function workflowActionRequest() {
    return Promise.reject(new Error("workflowActionRequest không còn được sử dụng."));
  }

  const caseApi = {
    list(params) {
      return request(buildUrl("/api/v1/cases/", params));
    },
    retrieve(id) {
      throw new Error("REST chi tiết hồ sơ đã bị vô hiệu hóa; dùng trang MVT /hosocongviec/{id}/.");
    },
    create(payload) {
      return Promise.reject(
        new Error("REST tạo hồ sơ đã bị vô hiệu hóa; dùng MVT /hosocongviec/taomoi/.")
      );
    },
    update(id, payload, method = "PATCH") {
      return Promise.reject(new Error("REST cập nhật hồ sơ đã bị vô hiệu hóa."));
    },
    participants(id, method = "GET", payload) {
      if (!id) throw new Error("Thiếu case_id");
      return request(`/api/v1/cases/${id}/participants/`, {
        method,
        body: payload,
      });
    },
    tasks(id, method = "GET", payload) {
      if (!id) throw new Error("Thiếu case_id");
      return request(`/api/v1/cases/${id}/tasks/`, {
        method,
        body: payload,
      });
    },
    updateTask(taskId, payload) {
      if (!taskId) throw new Error("Thiếu task_id");
      return request(`/api/v1/case-tasks/${taskId}/`, {
        method: "PATCH",
        body: payload,
      });
    },
    attachments(id, method = "GET", payload) {
      if (!id) throw new Error("Thiếu case_id");
      return request(`/api/v1/cases/${id}/attachments/`, {
        method,
        body: payload,
      });
    },
    documents(id, payload) {
      if (!id) throw new Error("Thiếu case_id");
      return request(`/api/v1/cases/${id}/documents/`, {
        method: payload ? "PUT" : "GET",
        body: payload,
      });
    },
    activityLogs(id) {
      if (!id) throw new Error("Thiếu case_id");
      return request(`/api/v1/cases/${id}/activity-logs/`);
    },
    close(id, payload) {
      return Promise.reject(
        new Error("REST đề nghị/phê duyệt đóng đã bị vô hiệu hóa; dùng luồng MVT.")
      );
    },
    watch(id) {
      if (!id) throw new Error("Thiếu case_id");
      return request(`/api/v1/cases/${id}/watch/`, { method: "POST" });
    },
    unwatch(id) {
      if (!id) throw new Error("Thiếu case_id");
      return request(`/api/v1/cases/${id}/watch/`, { method: "DELETE" });
    },
  };

  function ensureEntityId(value, label) {
    const raw = String(value || "").trim();
    if (!raw) {
      throw new Error(`Thiếu ${label}`);
    }
    return encodeURIComponent(raw);
  }

  const userApi = {
    list(params) {
      return request(buildUrl("/api/v1/admin/users/", params), {
        method: "GET",
      });
    },
    create(payload) {
      return request("/api/v1/admin/users/", {
        method: "POST",
        body: payload,
      });
    },
    retrieve(id) {
      return request(`/api/v1/admin/users/${ensureEntityId(id, "user_id")}/`);
    },
    update(id, payload) {
      return request(`/api/v1/admin/users/${ensureEntityId(id, "user_id")}/`, {
        method: "PATCH",
        body: payload,
      });
    },
    delete(id) {
      return request(`/api/v1/admin/users/${ensureEntityId(id, "user_id")}/`, {
        method: "DELETE",
      });
    },
    lock(id) {
      return request(`/api/v1/admin/users/${ensureEntityId(id, "user_id")}/lock/`, {
        method: "POST",
      });
    },
    unlock(id) {
      return request(`/api/v1/admin/users/${ensureEntityId(id, "user_id")}/unlock/`, {
        method: "POST",
      });
    },
    listRoles(id) {
      return request(`/api/v1/admin/users/${ensureEntityId(id, "user_id")}/roles/`, {
        method: "GET",
      });
    },
    assignRoles(id, roleIds) {
      return request(`/api/v1/admin/users/${ensureEntityId(id, "user_id")}/roles/`, {
        method: "PUT",
        body: { role_ids: Array.isArray(roleIds) ? roleIds : [] },
      });
    },
  };

  const specialistApi = {
    list(params) {
      return request(buildUrl("/api/v1/specialists/", params));
    },
  };

  const clerkApi = {
    list(params) {
      return request(buildUrl("/api/v1/clerks/", params));
    },
  };

  const roleApi = {
    list(params) {
      return request(buildUrl("/api/v1/admin/roles/", params), { method: "GET" });
    },
    create(payload) {
      return request("/api/v1/admin/roles/", {
        method: "POST",
        body: payload,
      });
    },
    retrieve(id) {
      return request(`/api/v1/admin/roles/${ensureEntityId(id, "role_id")}/`);
    },
    assignPermissions(id, permissionIds) {
      return request(`/api/v1/admin/roles/${ensureEntityId(id, "role_id")}/permissions/`, {
        method: "PUT",
        body: { permission_ids: Array.isArray(permissionIds) ? permissionIds : [] },
      });
    },
  };

  const permissionApi = {
    list(params) {
      return request(buildUrl("/api/v1/admin/permissions/", params), { method: "GET" });
    },
  };

  const auditApi = {
    list(params) {
      return request(buildUrl("/api/v1/audit-logs/", params), { method: "GET" });
    },
  };

  const departmentApi = {
    list(params) {
      return request(buildUrl("/api/v1/departments/", params), { method: "GET" });
    },
    create(payload) {
      return request("/api/v1/departments/", {
        method: "POST",
        body: payload,
      });
    },
  };
  const organizationApi = {
    list(params) {
      return request(buildUrl("/api/v1/organizations/", params));
    },
    create(payload) {
      return request("/api/v1/organizations/", {
        method: "POST",
        body: payload,
      });
    },
    update(id, payload) {
      if (!id) throw new Error("Thiếu organization_id");
      return request(`/api/v1/organizations/${id}/`, {
        method: "PATCH",
        body: payload,
      });
    },
    delete(id) {
      if (!id) throw new Error("Thiếu organization_id");
      return request(`/api/v1/organizations/${id}/`, {
        method: "DELETE",
      });
    },
    contacts(id) {
      return request(
        `/api/v1/organizations/${ensureEntityId(id, "organization_id")}/contacts`
      );
    },
    createContact(id, payload) {
      return request(
        `/api/v1/organizations/${ensureEntityId(id, "organization_id")}/contacts`,
        {
          method: "POST",
          body: payload,
        }
      );
    },
  };
  const dispatchApi = {
    update(id, payload) {
      return request(`/api/v1/dispatches/${ensureEntityId(id, "dispatch_id")}/`, {
        method: "PATCH",
        body: payload,
      });
    },
    resend(id) {
      return request(`/api/v1/dispatches/${ensureEntityId(id, "dispatch_id")}/resend/`, {
        method: "POST",
      });
    },
  };
  const catalogApi = {
    _base(name) {
      if (!name) throw new Error("Thiếu tên danh mục.");
      return `/api/v1/catalog/${encodeURIComponent(name)}`;
    },
    list(name, params) {
      return request(buildUrl(`${this._base(name)}/`, params));
    },
    create(name, payload) {
      return request(`${this._base(name)}/`, {
        method: "POST",
        body: payload,
      });
    },
    retrieve(name, id) {
      return request(`${this._base(name)}/${ensureEntityId(id, "item_id")}/`);
    },
    update(name, id, payload) {
      return request(`${this._base(name)}/${ensureEntityId(id, "item_id")}/`, {
        method: "PATCH",
        body: payload,
      });
    },
    delete(name, id) {
      return request(`${this._base(name)}/${ensureEntityId(id, "item_id")}/`, {
        method: "DELETE",
      });
    },
  };
  const api = {
    init(config) {
      const cfg = config || {};
      if (cfg.baseUrl) {
        setBaseUrl(cfg.baseUrl);
      }
      if (typeof cfg.onAuthChanged === "function") {
        onAuthChanged(cfg.onAuthChanged);
      }
      return {
        baseUrl,
        accessToken: getAccessToken(),
        refreshToken: getRefreshToken(),
        user: getStoredUser(),
      };
    },
    setBaseUrl,
    getBaseUrl: () => baseUrl,
    login,
    logout,
    request,
    getMe,
    updateProfile,
    changePassword,
    listSessions,
    revokeSession,
    getSessionId,
    ensureAuthenticated,
    getAccessToken,
    extractItems,
    extractPageMeta,
    getRefreshToken,
    getCurrentUser: getStoredUser,
    onAuthChanged,
    clearAuth,
    buildUrl,
    registerBooks: registerBookApi,
    numberingRules: numberingRuleApi,
    documentTemplates: documentTemplateApi,
    catalog: catalogApi,
    organizations: organizationApi,
    document: documentApi,
    documents: documentApi,
    dispatches: dispatchApi,
    cases: caseApi,
    workflowTransitions: workflowTransitionApi,
    comments: commentsApi,
    users: userApi,
    specialists: specialistApi,
    clerks: clerkApi,
    roles: roleApi,
    permissions: permissionApi,
    audit: auditApi,
    departments: departmentApi,
    notifications: notificationApi,
    reminders: reminderApi,
  };

  global.ApiClient = api;
})(window);
