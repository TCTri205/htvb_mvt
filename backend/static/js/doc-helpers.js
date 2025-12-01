/* ===================================================================
   doc-helpers.js
   Shared helpers for document listings across roles (fetch adapters,
   normalization, status/urgency mapping, error formatting).
   =================================================================== */

(function (global) {
  const helpers = {
    normalizeText,
    escapeHtml,
    formatDate,
    resolveErrorMessage,
    validateDocumentPayload,

    mapInboundStatusKey,
    mapInboundStatusLabel,
    getInboundStateFlow,
    getInboundStateMeta,
    mapOutboundStatusKey,
    mapOutboundStatusLabel,

    mapUrgencyKey,
    mapUrgencyLabel,
    mapSecurityLabel,

    normalizeInboundDoc,
    normalizeOutboundDoc,
    computeInboundKPIs,
    computeOutboundKPIs,
  };

  global.DocHelpers = helpers;

  function normalizeText(value) {
    return (value || "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function escapeHtml(value) {
    return (value || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(value) {
    if (!value) return "";
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return [
        String(value.getDate()).padStart(2, "0"),
        String(value.getMonth() + 1).padStart(2, "0"),
        value.getFullYear(),
      ].join("/");
    }
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split("-");
      return [d, m, y].join("/");
    }
    return raw;
  }

  function resolveErrorMessage(error) {
    if (!error) return "Không thể tải dữ liệu từ máy chủ.";
    if (error.data) {
      if (typeof error.data === "string") return error.data;
      if (error.data.detail) return String(error.data.detail);
      if (error.data.message) return String(error.data.message);
    }
    if (error.message) return String(error.message);
    return "Không thể tải dữ liệu từ máy chủ.";
  }

  function validateDocumentPayload(payload) {
    const errors = [];
    const data = payload || {};
    const direction = normalizeText(data.doc_direction);
    if (!direction) {
      errors.push("Chưa xác định hướng văn bản.");
    }
    if (!data.title || !data.title.trim()) {
      errors.push("Tiêu đề văn bản là bắt buộc.");
    }
    if (direction === "du_thao" && !data.document_code) {
      errors.push("Dự thảo cần nhập ký hiệu (document_code).");
    }
    if (direction === "den") {
      if (!data.received_number && data.received_number !== 0) {
        errors.push("Văn bản đến cần số đến (received_number).");
      }
      if (!data.received_date) {
        errors.push("Văn bản đến cần ngày đến (received_date).");
      }
      if (!data.sender || !data.sender.trim()) {
        errors.push("Văn bản đến cần thông tin cơ quan gửi.");
      }
    }
    if (direction === "di") {
      if (!data.issue_number || !data.issue_number.trim()) {
        errors.push("Văn bản đi cần số phát hành (issue_number).");
      }
      if (!data.issued_date) {
        errors.push("Văn bản đi cần ngày phát hành (issued_date).");
      }
    }
    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  const inboundStateFlow = [
    {
      key: "tiep-nhan",
      label: "Tiếp nhận",
      transitionLabel: "Gán số đến",
      action: "register",
      next: "dang-ky",
    },
    {
      key: "dang-ky",
      label: "Đăng ký",
      transitionLabel: "Phân công",
      action: "assign",
      next: "phan-cong",
    },
    {
      key: "phan-cong",
      label: "Phân công",
      transitionLabel: "Bắt đầu xử lý",
      action: "start",
      next: "dang-xu-ly",
    },
    {
      key: "dang-xu-ly",
      label: "Đang xử lý",
      transitionLabel: "Hoàn tất",
      action: "complete",
      next: "hoan-tat",
    },
    {
      key: "hoan-tat",
      label: "Hoàn tất",
      transitionLabel: "Lưu trữ",
      action: "archive",
      next: "luu-tru",
    },
    {
      key: "luu-tru",
      label: "Lưu trữ",
      transitionLabel: "",
      action: null,
      next: null,
    },
    {
      key: "thu-hoi",
      label: "Thu hồi",
      transitionLabel: "",
      action: null,
      next: null,
    },
  ];

  const inboundStateKeys = new Set(inboundStateFlow.map((item) => item.key));

  function getInboundStateFlow() {
    return inboundStateFlow.slice();
  }

  function getInboundStateMeta(key) {
    return inboundStateFlow.find((item) => item.key === key) || null;
  }

  function mapInboundStatusKey(raw) {
    const value = normalizeText(raw);
    if (!value) return "tiep-nhan";
    if (
      value.includes("thuhoi") ||
      value.includes("thu_hoi") ||
      value.includes("withdraw")
    ) {
      return "thu-hoi";
    }
    if (
      value.includes("luutru") ||
      value.includes("luu_tru") ||
      value.includes("archive")
    ) {
      return "luu-tru";
    }
    if (
      value.includes("hoantat") ||
      value.includes("hoan_tat") ||
      value.includes("complete") ||
      value.includes("done")
    ) {
      return "hoan-tat";
    }
    if (
      value.includes("dangxuly") ||
      value.includes("dang_xu_ly") ||
      value.includes("processing") ||
      value.includes("process")
    ) {
      return "dang-xu-ly";
    }
    if (
      value.includes("phancong") ||
      value.includes("phan_cong") ||
      value.includes("assign")
    ) {
      return "phan-cong";
    }
    if (
      value.includes("dangky") ||
      value.includes("dang_ky") ||
      value.includes("register")
    ) {
      return "dang-ky";
    }
    return "tiep-nhan";
  }

  function mapInboundStatusLabel(key, fallback) {
    switch (key) {
      case "tiep-nhan":
        return "Tiếp nhận";
      case "dang-ky":
        return "Đăng ký";
      case "phan-cong":
        return "Phân công";
      case "dang-xu-ly":
        return "Đang xử lý";
      case "hoan-tat":
        return "Hoàn tất";
      case "luu-tru":
        return "Lưu trữ";
      case "thu-hoi":
        return "Thu hồi";
      default:
        return fallback || "Chưa xử lý";
    }
  }

  function mapOutboundStatusKey(raw) {
    const value = normalizeText(raw);
    if (!value) return "draft";
    
    // 1. Published / Issued
    if (/phat_hanh|publish|published|ban_hanh|issued|issue/.test(value)) {
      return "published";
    }
    
    // 2. Registered (Đã vào sổ)
    if (/dang_ky|registered|vao_so/.test(value)) {
      return "registered";
    }
    
    // 3. Pending Clerk Check (Chờ văn thư kiểm tra)
    // Note: "approved" is legacy, now it's "pending_clerk_check"
    if (
      /cho_vt|cho_van_thu|pending_clerk|clerk_check|approved|phe_duyet|ky_so/.test(
        value
      )
    ) {
      return "processing";
    }

    // 4. Submitted / Pending Leader Approval (Chờ lãnh đạo duyệt)
    if (
      /trinh|submit|submitted|cho_duyet|pending_leader|waiting/.test(value)
    ) {
      return "submitted";
    }

    // 5. Draft / Returned
    return "draft";
  }

  function mapOutboundStatusLabel(key, fallback) {
    switch (key) {
      case "submitted":
        return "Chờ duyệt";
      case "processing":
        return "Chờ văn thư kiểm tra";
      case "registered":
        return "Đã vào sổ";
      case "published":
        return "Đã phát hành";
      case "draft":
      default:
        return fallback || "Dự thảo";
    }
  }

  function mapUrgencyKey(raw) {
    const value = normalizeText(raw);
    if (/rat_khan|very_urgent|hoa_toc/.test(value)) return "ratkhan";
    if (/khan|urgent/.test(value)) return "khan";
    if (/cao|high/.test(value)) return "cao";
    return "thuong";
  }

  function mapUrgencyLabel(key, fallback) {
    switch (key) {
      case "ratkhan":
        return "Rất khẩn";
      case "khan":
        return "Khẩn";
      case "cao":
        return "Cao";
      case "thuong":
        return fallback || "Thường";
      default:
        return fallback || "";
    }
  }

  function mapSecurityLabel(raw) {
    const value = normalizeText(raw);
    if (!value) return "";
    if (/tuyet|absolute/.test(value)) return "Tuyệt mật";
    if (/mat|secret/.test(value)) return "Mật";
    if (/mat|restricted/.test(value)) return "Mật";
    if (/khong|none|thuong/.test(value)) return "Không mật";
    return raw || "";
  }

  function normalizeInboundDoc(raw) {
    const statusKey = mapInboundStatusKey(
      raw?.status_name || raw?.status?.name || raw?.status?.code
    );
    const urgencyKey = mapUrgencyKey(raw?.urgency?.name || raw?.urgency?.code);
    const securityLabel = mapSecurityLabel(
      raw?.security?.name || raw?.security?.code
    );
    const incomingNumber = raw?.incoming_number || "";
    const number =
      incomingNumber || raw?.document_code || raw?.outgoing_number || "";
    const issuedDate = raw?.issued_date || "";
    const receivedDate =
      raw?.received_date ||
      (typeof raw?.created_at === "string" ? raw.created_at.slice(0, 10) : "");
    const sender = raw?.sender || "";
    const department = raw?.department?.name || "";
    const creatorName = raw?.creator?.full_name || raw?.creator?.username || "";
    const docType = raw?.document_type?.name || raw?.document_type?.code || "";
    const dueDate =
      raw?.due_date ||
      raw?.deadline ||
      (typeof raw?.expected_finish === "string"
        ? raw.expected_finish.slice(0, 10)
        : "");
    const hasAttachments = Boolean(raw?.has_attachments);
    const searchText = normalizeText(
      [
        raw?.title,
        number,
        incomingNumber,
        sender,
        department,
        creatorName,
        docType,
        securityLabel,
      ].join(" ")
    );

    return {
      raw,
      id: raw?.id ?? null,
      docDirection: raw?.doc_direction || raw?.direction || "den",
      title: raw?.title || "",
      number,
      incomingNumber,
      issuedDate,
      receivedDate,
      sender,
      department,
      docType,
      dueDate,
      creatorName,
      hasAttachments,
      assigneeCount:
        typeof raw?.assignee_count === "number" ? raw.assignee_count : 0,
      etag: raw?.etag || null,
      statusKey,
      statusLabel: mapInboundStatusLabel(statusKey, raw?.status_name),
      urgencyKey,
      urgencyLabel: mapUrgencyLabel(
        urgencyKey,
        raw?.urgency?.name || raw?.urgency?.code
      ),
      securityLabel,
      searchText,
    };
  }

  function normalizeOutboundDoc(raw) {
    const statusKey = mapOutboundStatusKey(
      raw?.status_name || raw?.status?.name || raw?.status?.code
    );
    const urgencyKey = mapUrgencyKey(raw?.urgency?.name || raw?.urgency?.code);
    const securityLabel = mapSecurityLabel(
      raw?.security?.name || raw?.security?.code
    );
    const outgoingNumber = raw?.outgoing_number || raw?.document_code || "";
    const issuedDate =
      raw?.issued_date ||
      raw?.published_date ||
      (typeof raw?.created_at === "string" ? raw.created_at.slice(0, 10) : "");
    const publishedDate =
      raw?.published_date ||
      (typeof raw?.dispatched_at === "string"
        ? raw.dispatched_at.slice(0, 10)
        : "");
    const signer =
      raw?.signer?.full_name ||
      raw?.signer?.username ||
      raw?.creator?.full_name ||
      raw?.creator?.username ||
      "";
    const recipients = raw?.department?.name || raw?.receiver || "";
    const searchText = normalizeText(
      [
        raw?.title,
        outgoingNumber,
        issuedDate,
        signer,
        recipients,
        raw?.summary,
        securityLabel,
      ].join(" ")
    );

    return {
      raw,
      id: raw?.id ?? null,
      title: raw?.title || "",
      docDirection: raw?.doc_direction || raw?.direction || "di",
      number: outgoingNumber,
      issuedDate,
      publishedDate,
      signer,
      recipients,
      etag: raw?.etag || null,
      hasAttachments: Boolean(raw?.has_attachments),
      statusKey,
      statusLabel: mapOutboundStatusLabel(statusKey, raw?.status_name),
      urgencyKey,
      urgencyLabel: mapUrgencyLabel(
        urgencyKey,
        raw?.urgency?.name || raw?.urgency?.code
      ),
      securityLabel,
      searchText,
    };
  }

  function computeInboundKPIs(list) {
    const result = {
      total: Array.isArray(list) ? list.length : 0,
      urgent: 0,
      states: {
        "tiep-nhan": 0,
        "dang-ky": 0,
        "phan-cong": 0,
        "dang-xu-ly": 0,
        "hoan-tat": 0,
        "luu-tru": 0,
        "thu-hoi": 0,
      },
    };
    if (!Array.isArray(list)) {
      return result;
    }
    list.forEach((doc) => {
      if (!doc || typeof doc !== "object") return;
      const key =
        doc.statusKey || mapInboundStatusKey(doc.status || doc.status_name);
      if (Object.prototype.hasOwnProperty.call(result.states, key)) {
        result.states[key] += 1;
      } else {
        result.states["tiep-nhan"] += 1;
      }
      if (doc.urgencyKey === "khan" || doc.urgencyKey === "ratkhan") {
        result.urgent += 1;
      }
    });
    return result;
  }

  function computeOutboundKPIs(list) {
    const result = {
      total: Array.isArray(list) ? list.length : 0,
      draft: 0,
      submitted: 0,
      processing: 0,
      registered: 0,
      published: 0,
      urgent: 0,
    };
    if (!Array.isArray(list)) {
      return result;
    }
    list.forEach((doc) => {
      if (!doc || typeof doc !== "object") return;
      // Ensure we have a valid key from our map
      const key = doc.statusKey || mapOutboundStatusKey(doc.status || doc.status_name);
      
      if (Object.prototype.hasOwnProperty.call(result, key)) {
        result[key] += 1;
      } else {
        // Fallback for any unmapped status -> treat as draft or ignore?
        // For now, let's just count it if it matches one of our known keys
        // If not, it might be 'draft' by default in mapOutboundStatusKey
      }

      if (doc.urgencyKey === "khan" || doc.urgencyKey === "ratkhan") {
        result.urgent += 1;
      }
    });
    return result;
  }
})(window);
