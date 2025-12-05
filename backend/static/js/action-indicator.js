/**
 * Action Indicator Module
 * Determines if a document/case needs action from the current user
 * and provides rendering helper for the indicator.
 */
(function() {
  'use strict';

  // Inbound document statuses requiring action per role
  const INBOUND_ACTION_STATUS = {
    VT: ['RECEIVED', 'TIEP_NHAN', 'PENDING_CLERK_CHECK', 'CHO_VAN_THU_KIEM_TRA'],
    LD: ['WAITING_ASSIGNMENT', 'CHO_PHAN_CONG', 'PENDING_LEADER_APPROVAL', 'CHO_LANH_DAO_PHE_DUYET'],
    CV: ['PROCESSING', 'DANG_XU_LY'],
  };

  // Outbound document statuses requiring action per role
  const OUTBOUND_ACTION_STATUS = {
    VT: ['PENDING_CLERK_CHECK', 'CHO_VAN_THU_KIEM_TRA', 'APPROVED', 'DA_DUYET'],
    LD: ['PENDING_REVIEW', 'CHO_DUYET', 'SUBMITTED', 'DA_TRINH'],
    CV: ['DRAFT', 'DU_THAO', 'RETURNED', 'TRA_LAI'],
  };

  // Case statuses requiring action per role
  const CASE_ACTION_STATUS = {
    LD: ['CHO_DUYET_DONG', 'MO'],
    CV: ['MO'],
  };

  /**
   * Normalize status key to uppercase with underscores
   */
  function normalizeStatus(status) {
    if (!status) return '';
    if (typeof status === 'object') {
      status = status.code || status.name || status.status_name || '';
    }
    return String(status).trim().toUpperCase().replace(/[\s-]+/g, '_');
  }

  /**
   * Get user role from Layout or window
   */
  function getUserRole() {
    // 1. Check Layout.role (most reliable - set by layout.js)
    const layout = window.Layout || {};
    if (layout.role) {
      const lr = layout.role.toString().toUpperCase().replace(/[^A-Z]/g, '');
      if (lr.includes('LANHDAO') || lr === 'LD') return 'LD';
      if (lr.includes('VANTHU') || lr === 'VT') return 'VT';
      if (lr.includes('CHUYENVIEN') || lr === 'CV') return 'CV';
    }
    
    // 2. Check user object (Layout.user or api.getCurrentUser())
    const api = window.ApiClient || {};
    const user = layout.user || (typeof api.getCurrentUser === 'function' ? api.getCurrentUser() : null) || window.currentUser || {};
    
    // Check role/roleName string (used by this system)
    const roleStr = (user.role || user.roleName || user.role_name || '').toString().toUpperCase().replace(/[^A-Z_]/g, '');
    if (roleStr) {
      if (roleStr.includes('LANH') || roleStr.includes('LD')) return 'LD';
      if (roleStr.includes('VAN') && roleStr.includes('THU')) return 'VT';
      if (roleStr.includes('VT')) return 'VT';
      if (roleStr.includes('CHUYEN') || roleStr.includes('CV')) return 'CV';
    }
    
    // Check roles array (legacy)
    const roles = user.roles || user.role_codes || [];
    if (Array.isArray(roles) && roles.length) {
      if (roles.includes('LD') || roles.includes('LANH_DAO')) return 'LD';
      if (roles.includes('CV') || roles.includes('CHUYEN_VIEN')) return 'CV';
      if (roles.includes('VT') || roles.includes('VAN_THU')) return 'VT';
    }
    
    // 3. Fallback: detect from URL path
    const path = window.location.pathname || '';
    if (path.includes('/lanhdao/')) return 'LD';
    if (path.includes('/chuyenvien/')) return 'CV';
    if (path.includes('/vanthu/')) return 'VT';
    
    return '';
  }


  /**
   * Get current user ID
   */
  function getUserId() {
    const layout = window.Layout || {};
    const profile = layout.currentUser || layout.user || window.currentUser || {};
    return profile.user_id || profile.userId || profile.id || '';
  }

  /**
   * Check if user is assigned to document
   */
  function isAssignedToDoc(doc, userId) {
    if (!userId || !doc) return false;
    
    // Check assignments array
    const assignments = doc.assignments || [];
    for (const a of assignments) {
      const assigneeId = a.user_id || a.user?.user_id || a.user?.id || '';
      if (String(assigneeId) === String(userId)) {
        return true;
      }
    }
    
    // Check current_assignee
    const currentAssignee = doc.current_assignee || {};
    if (String(currentAssignee.user_id || currentAssignee.id || '') === String(userId)) {
      return true;
    }
    
    return false;
  }

  /**
   * Check if user created the document
   */
  function isCreator(doc, userId) {
    if (!userId || !doc) return false;
    const createdBy = doc.created_by || doc.creator || {};
    const creatorId = createdBy.user_id || createdBy.id || doc.created_by_id || '';
    return String(creatorId) === String(userId);
  }

  /**
   * Check if inbound document needs action from current user
   */
  function inboundNeedsAction(doc, userRole, userId) {
    if (!doc) return false;
    userRole = userRole || getUserRole();
    userId = userId || getUserId();
    
    const status = normalizeStatus(doc.status || doc.state || doc.status_name);
    const actionStatuses = INBOUND_ACTION_STATUS[userRole] || [];
    
    // Check if status requires action for this role
    const statusMatch = actionStatuses.some(s => status.includes(s) || s.includes(status));
    if (!statusMatch) return false;
    
    // CV: should be assigned, but if userId unavailable, use status match only
    if (userRole === 'CV') {
      if (!userId) return true;
      return isAssignedToDoc(doc, userId);
    }
    
    // VT, LD: status match is enough
    return true;
  }

  /**
   * Check if outbound document needs action from current user
   */
  function outboundNeedsAction(doc, userRole, userId) {
    if (!doc) return false;
    userRole = userRole || getUserRole();
    userId = userId || getUserId();
    
    const status = normalizeStatus(doc.status || doc.state || doc.status_name);
    const actionStatuses = OUTBOUND_ACTION_STATUS[userRole] || [];
    
    const statusMatch = actionStatuses.some(s => status.includes(s) || s.includes(status));
    if (!statusMatch) return false;
    
    // CV: should be creator or assigned, but if userId unavailable, use status match only
    if (userRole === 'CV') {
      // If we don't have userId, just use status match (better UX than showing nothing)
      if (!userId) return true;
      // Otherwise check creator/assigned
      return isCreator(doc, userId) || isAssignedToDoc(doc, userId);
    }
    
    return true;
  }


  /**
   * Check if case needs action from current user
   */
  function caseNeedsAction(caseItem, userRole, userId) {
    if (!caseItem) return false;
    userRole = userRole || getUserRole();
    userId = userId || getUserId();
    
    const status = normalizeStatus(caseItem.status || caseItem.state || caseItem.status_name);
    const actionStatuses = CASE_ACTION_STATUS[userRole] || [];
    
    const statusMatch = actionStatuses.some(s => status.includes(s) || s.includes(status));
    if (!statusMatch) return false;
    
    // LD with CHO_DUYET_DONG: needs approval
    if (userRole === 'LD' && status.includes('CHO_DUYET_DONG')) {
      return true;
    }
    
    // LD with MO: check if owner (or fallback to true if no userId)
    if (userRole === 'LD' && status.includes('MO')) {
      if (!userId) return true;
      const ownerId = caseItem.owner_id || caseItem.owner?.user_id || caseItem.owner?.id || '';
      return String(ownerId) === String(userId);
    }
    
    // CV with MO: check if assigned (or fallback to true if no userId)
    if (userRole === 'CV' && status.includes('MO')) {
      if (!userId) return true;
      if (!isAssignedToDoc(caseItem, userId)) return false;
      // Check for pending tasks
      const tasks = caseItem.tasks || [];
      if (!tasks.length) return true; // No tasks data = assume needs action
      return tasks.some(t => {
        const taskStatus = normalizeStatus(t.status);
        const isAssignee = String(t.assignee_id || t.assignee?.user_id || '') === String(userId);
        return isAssignee && !taskStatus.includes('DONE') && !taskStatus.includes('HOAN_THANH');
      });
    }
    
    return false;
  }

  /**
   * Render the action indicator HTML
   */
  function renderIndicator() {
    return '<span class="action-indicator" title="Cần xử lý"></span>';
  }

  /**
   * Check if any document/case needs action (generic)
   */
  function needsAction(item, type) {
    type = (type || '').toLowerCase();
    if (type === 'inbound' || type === 'den' || type === 'vanbanden') {
      return inboundNeedsAction(item);
    }
    if (type === 'outbound' || type === 'di' || type === 'vanbandi') {
      return outboundNeedsAction(item);
    }
    if (type === 'case' || type === 'hoso' || type === 'hosocongviec') {
      return caseNeedsAction(item);
    }
    return false;
  }

  // Export module
  window.ActionIndicator = {
    inboundNeedsAction: inboundNeedsAction,
    outboundNeedsAction: outboundNeedsAction,
    caseNeedsAction: caseNeedsAction,
    needsAction: needsAction,
    renderIndicator: renderIndicator,
    getUserRole: getUserRole,
    getUserId: getUserId,
    normalizeStatus: normalizeStatus,
  };

})();
