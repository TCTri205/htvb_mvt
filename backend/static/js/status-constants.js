/**
 * Shared Status Constants for Outbound Documents
 * ==================================================
 * Single source of truth for status normalization, labels, and styling.
 * 
 * IMPORTANT: Keep this in sync with backend/workflow/services/outbound_service.py
 * 
 * @version 1.0.0
 * @date 2025-12-02
 */
(function(global) {
  'use strict';

  /**
   * Status code aliases for normalization
   * Maps Vietnamese/legacy status codes to canonical English codes
   */
  const STATUS_CODE_ALIASES = {
    // DRAFT variations
    DU_THAO: "DRAFT",
    DRAFT: "DRAFT",
    
    // SUBMITTED variations  
    TRINH_DUYET: "SUBMITTED",
    DA_TRINH: "SUBMITTED",
    TRINH_LANH_DAO: "SUBMITTED",
    DA_TRINH_LANH_DAO: "SUBMITTED",
    TRINH_LD: "SUBMITTED",
    DA_TRINH_LD: "SUBMITTED",
    CHO_LANH_DAO_PHE_DUYET: "SUBMITTED",
    CHO_LD_PHE_DUYET: "SUBMITTED",
    PENDING_LEADER_APPROVAL: "SUBMITTED",
    SUBMITTED: "SUBMITTED",
    
    // ⚠️ RETURNED mapped to DRAFT (status removed from workflow - no longer used)
    // Documents previously in RETURNED status are now treated as DRAFT
    BI_TRA_LAI: "DRAFT",
    TRA_LAI: "DRAFT",
    RETURNED: "DRAFT",
    
    // ⚠️ APPROVED mapped to PENDING_CLERK_CHECK (workflow changed)
    // Leader approval now goes directly to clerk check instead of APPROVED status
    PHE_DUYET: "PENDING_CLERK_CHECK",
    LD_DA_PHE_DUYET: "PENDING_CLERK_CHECK",
    KY_SO: "PENDING_CLERK_CHECK",
    APPROVED: "PENDING_CLERK_CHECK",
    CHO_VAN_THU_KIEM_TRA: "PENDING_CLERK_CHECK",
    CHO_VT_KIEM_TRA: "PENDING_CLERK_CHECK",
    PENDING_CLERK_CHECK: "PENDING_CLERK_CHECK",
    
    // REGISTERED variations
    DANG_KY: "REGISTERED",
    DA_VAO_SO: "REGISTERED",
    REGISTERED: "REGISTERED",
    
    // ISSUED variations
    PHAT_HANH: "ISSUED",
    DA_PHAT_HANH: "ISSUED",
    ISSUED: "ISSUED",
    
    // CANCELLED
    HUY_PHAT_HANH: "HUY_PHAT_HANH",
    CANCELLED: "HUY_PHAT_HANH",
    
    // ARCHIVED variations
    LUU_TRU: "ARCHIVED",
    DA_LUU_TRU: "ARCHIVED",
    ARCHIVED: "ARCHIVED",
  };

  /**
   * Vietnamese labels for each canonical status
   */
  const STATUS_LABELS = {
    DRAFT: "Dự thảo",
    SUBMITTED: "Đã trình",
    PENDING_CLERK_CHECK: "Chờ kiểm tra",
    REGISTERED: "Đã vào sổ",
    ISSUED: "Đã phát hành",
    HUY_PHAT_HANH: "Hủy phát hành",
    ARCHIVED: "Đã lưu trữ",
  };

  /**
   * CSS classes for status badges
   * Format: "bg-{color}-100 text-{color}-700"
   */
  const STATUS_CLASSES = {
    DRAFT: "bg-slate-100 text-slate-700",
    SUBMITTED: "bg-blue-100 text-blue-700",
    PENDING_CLERK_CHECK: "bg-yellow-100 text-yellow-700",
    REGISTERED: "bg-purple-100 text-purple-700",
    ISSUED: "bg-green-100 text-green-700",
    HUY_PHAT_HANH: "bg-rose-100 text-rose-700",
    ARCHIVED: "bg-gray-100 text-gray-700",
  };

  /**
   * Status metadata combining label and classes for list views
   */
  const STATUS_META = {
    DRAFT: { 
      label: STATUS_LABELS.DRAFT, 
      classes: STATUS_CLASSES.DRAFT,
      className: STATUS_CLASSES.DRAFT,
    },
    SUBMITTED: { 
      label: STATUS_LABELS.SUBMITTED, 
      classes: STATUS_CLASSES.SUBMITTED,
      className: STATUS_CLASSES.SUBMITTED,
    },
    PENDING_CLERK_CHECK: { 
      label: STATUS_LABELS.PENDING_CLERK_CHECK, 
      classes: STATUS_CLASSES.PENDING_CLERK_CHECK,
      className: STATUS_CLASSES.PENDING_CLERK_CHECK,
    },
    REGISTERED: { 
      label: STATUS_LABELS.REGISTERED, 
      classes: STATUS_CLASSES.REGISTERED,
      className: STATUS_CLASSES.REGISTERED,
    },
    ISSUED: { 
      label: STATUS_LABELS.ISSUED, 
      classes: STATUS_CLASSES.ISSUED,
      className: STATUS_CLASSES.ISSUED,
    },
    HUY_PHAT_HANH: { 
      label: STATUS_LABELS.HUY_PHAT_HANH, 
      classes: STATUS_CLASSES.HUY_PHAT_HANH,
      className: STATUS_CLASSES.HUY_PHAT_HANH,
    },
    ARCHIVED: { 
      label: STATUS_LABELS.ARCHIVED, 
      classes: STATUS_CLASSES.ARCHIVED,
      className: STATUS_CLASSES.ARCHIVED,
    },
  };

  /**
   * Normalize a status code string for consistent comparison
   * Converts to uppercase, removes accents, replaces special chars with underscore
   * 
   * @param {string} raw - Raw status string
   * @returns {string} Normalized status key
   */
  function buildStatusKey(raw) {
    if (!raw) return "";
    const normalized = String(raw).trim();
    if (!normalized) return "";
    
    return normalized
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/gi, "d")
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, "_")
      .replace(/__+/g, "_")
      .replace(/^_|_$/g, "");
  }

  /**
   * Normalize a raw status value to canonical status code
   * Handles strings, objects with various field names, and applies heuristics
   * 
   * @param {string|object} raw - Raw status value from API
   * @returns {string} Canonical status code (e.g., "DRAFT", "SUBMITTED")
   */
  function normalizeStatus(raw) {
    if (!raw) return "DRAFT";
    
    // Handle object: {code, status_name, name, etc.}
    if (typeof raw === "object" && raw !== null) {
      if (raw.code) return normalizeStatus(raw.code);
      if (raw.status_name) return normalizeStatus(raw.status_name);
      if (raw.name) return normalizeStatus(raw.name);
      
      // Try toString if object doesn't have expected fields
      const str = String(raw);
      if (str && str !== "[object Object]") {
        return normalizeStatus(str);
      }
      return "DRAFT";
    }
    
    // Build normalized key
    const key = buildStatusKey(raw);
    if (!key) return "DRAFT";
    
    // Check exact alias match first
    const alias = STATUS_CODE_ALIASES[key];
    if (alias) {
      return alias;
    }
    
    // Apply heuristics for variations not in aliases
    if (key.includes("SUBMIT") || key.includes("TRINH")) {
      return "SUBMITTED";
    }
    
    // RETURNED → DRAFT (status removed, map to DRAFT for backward compatibility)
    if (key.includes("RETURN") || key.includes("TRA_LAI")) {
      return "DRAFT";
    }
    
    // APPROVED → PENDING_CLERK_CHECK
    if (key.includes("APPROVE") || key.includes("PHE_DUYET")) {
      return "PENDING_CLERK_CHECK";
    }
    
    if (key.includes("CLERK") || key.includes("VAN_THU")) {
      return "PENDING_CLERK_CHECK";
    }
    
    if (key.includes("REGISTER") || key.includes("DANG_KY") || key.includes("VAO_SO")) {
      return "REGISTERED";
    }
    
    if (key.includes("ISSUE") || key.includes("PHAT_HANH")) {
      return "ISSUED";
    }
    
    if (key.includes("CANCEL") || key.includes("HUY")) {
      return "HUY_PHAT_HANH";
    }
    
    if (key.includes("ARCHIVE") || key.includes("LUU_TRU")) {
      return "ARCHIVED";
    }
    
    // If no heuristic matches, return the key as-is
    console.warn("[OutboundStatus] Unknown status, using as-is:", raw, "→", key);
    return key;
  }

  /**
   * Get Vietnamese label for a status
   * 
   * @param {string|object} status - Status value (will be normalized)
   * @returns {string} Vietnamese label
   */
  function getStatusLabel(status) {
    const normalized = normalizeStatus(status);
    return STATUS_LABELS[normalized] || normalized;
  }

  /**
   * Get CSS classes for a status badge
   * 
   * @param {string|object} status - Status value (will be normalized)
   * @returns {string} CSS classes string
   */
  function getStatusClass(status) {
    const normalized = normalizeStatus(status);
    return STATUS_CLASSES[normalized] || "bg-gray-100 text-gray-700";
  }

  /**
   * Get complete metadata for a status (label + classes)
   * 
   * @param {string|object} status - Status value (will be normalized)
   * @returns {object} Object with {label, classes, className}
   */
  function getStatusMeta(status) {
    const normalized = normalizeStatus(status);
    return STATUS_META[normalized] || {
      label: normalized,
      classes: "bg-gray-100 text-gray-700",
      className: "bg-gray-100 text-gray-700",
    };
  }

  /**
   * Format status object for display (extract readable name)
   * 
   * @param {string|object} status - Status value
   * @returns {string} Display string
   */
  function formatStatusLabel(status) {
    if (!status) return "";
    if (typeof status === "string") return status;
    if (typeof status === "object") {
      return status.name || status.code || status.status_name || "";
    }
    return String(status);
  }

  /**
   * Escape HTML to prevent XSS
   * 
   * @param {any} value - Value to escape
   * @returns {string} Escaped HTML string
   */
  function escapeHtml(value) {
    return (value || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Export to global scope
  global.OutboundStatus = {
    // Constants
    ALIASES: STATUS_CODE_ALIASES,
    LABELS: STATUS_LABELS,  
    CLASSES: STATUS_CLASSES,
    META: STATUS_META,
    
    // Functions
    buildStatusKey,
    normalizeStatus,
    getStatusLabel,
    getStatusClass,
    getStatusMeta,
    formatStatusLabel,
    escapeHtml,
  };

  // Also export for backward compatibility
  global.STATUS_CODE_ALIASES = STATUS_CODE_ALIASES;
  global.STATUS_LABELS = STATUS_LABELS;
  global.STATUS_CLASSES = STATUS_CLASSES;
  global.STATUS_META = STATUS_META;

  console.info("[OutboundStatus] Loaded v1.0.0");

})(window);
