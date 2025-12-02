/* ============================================================
   quantri-danhmuc.js
   Module xử lý trang Danh mục hệ thống (quantri/danhmuchethong.html)
============================================================ */

(function () {
  'use strict';

  const API_BASE = '/api/v1/catalog';
  const api = window.ApiClient || null;

  // Khởi tạo khi trang sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    // Chỉ chạy trên trang danh mục hệ thống
    const page = document.body.dataset.page;
    if (page !== 'danhmuc') return;

    console.log('[quantri-danhmuc] Initializing...');

    initTabSwitching();
    loadCatalogStats();
    loadDocumentTypes();
    initDocumentListModal();
  }

  // ========== TAB SWITCHING ==========
  function initTabSwitching() {
    const segButtons = document.querySelectorAll('.seg-btn[data-tab]');
    const tabs = document.querySelectorAll('[id^="tab-"]');

    segButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        
        // Update button states
        segButtons.forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');

        // Show/hide tabs
        tabs.forEach(tab => {
          if (tab.id === `tab-${tabName}`) {
            tab.classList.remove('hidden');
          } else {
            tab.classList.add('hidden');
          }
        });

        // Load data for specific tab
        switch (tabName) {
          case 'types':
            loadDocumentTypes();
            break;
          case 'fields':
            loadFields();
            break;
          case 'statuses':
            loadDocumentStatuses();
            break;
          // Add more tabs as needed
        }
      });
    });
  }

  // ========== LOAD CATALOG STATS ==========
  async function loadCatalogStats() {
    try {
      const response = await fetch(`${API_BASE}/stats/`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) throw new Error('Failed to load stats');
      
      const result = await response.json();
      const stats = result.data || result;

      // Update KPIs
      updateKPI('kpi-doc-types', stats.document_types_count);
      updateKPI('kpi-doc-statuses', stats.document_statuses_count);
      updateKPI('kpi-priorities', stats.urgency_levels_count);
      updateKPI('kpi-departments', stats.departments_count || '-');
      updateKPI('kpi-agencies', stats.agencies_count || '-');

      console.log('[quantri-danhmuc] Stats loaded:', stats);
    } catch (error) {
      console.error('[quantri-danhmuc] Failed to load stats:', error);
    }
  }

  function updateKPI(elementId, value) {
    const el = document.getElementById(elementId);
    if (el) {
      el.textContent = value !== undefined ? value : '-';
    }
  }

  // ========== LOAD DOCUMENT TYPES ==========
  async function loadDocumentTypes() {
    const tbody = document.querySelector('#tb-types');
    if (!tbody) {
      console.warn('[quantri-danhmuc] Table body #tb-types not found');
      return;
    }

    tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-slate-500">Đang tải...</td></tr>';

    try {
      const url = `${API_BASE}/document-types/?with_counts=1`;
      console.log('[quantri-danhmuc] Fetching:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include', // Important: send session cookies for authentication
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      console.log('[quantri-danhmuc] Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[quantri-danhmuc] API Error:', response.status, errorText);
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }

      const types = await response.json();
      
      // Debug: Log API response để kiểm tra structure
      console.log('[quantri-danhmuc] API Response:', types);
      if (types && types.length > 0) {
        console.log('[quantri-danhmuc] First item:', types[0]);
      }
      
      if (!types || types.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-slate-500">Chưa có loại văn bản nào</td></tr>';
        return;
      }

      tbody.innerHTML = types.map(type => createDocumentTypeRow(type)).join('');
      attachDocumentTypeActions();

      console.log('[quantri-danhmuc] Document types loaded:', types.length);
    } catch (error) {
      console.error('[quantri-danhmuc] Failed to load document types:', error);
      tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-6 text-center text-rose-500">
        Lỗi tải dữ liệu: ${error.message || 'Unknown error'}
      </td></tr>`;
    }
  }

  function createDocumentTypeRow(type) {
    // API trả về: {id, name, documents_count}
    const typeId = type.id;
    const typeName = escapeHtml(type.name || 'Chưa đặt tên');
    
    // Kiểm tra kỹ field documents_count
    let docCount = 0;
    if (type.documents_count !== undefined && type.documents_count !== null) {
        docCount = type.documents_count;
    } else {
        console.warn(`[quantri-danhmuc] Warning: Missing documents_count for type ID ${typeId}`, type);
    }
    
    return `
      <tr class="hover:bg-slate-50/60" data-type-id="${typeId}">
        <td class="px-4 py-3 font-mono text-[12px] text-slate-600">
          ${typeId ? `#document-types-${typeId}` : '—'}
        </td>
        <td class="px-4 py-3">${typeName}</td>
        <td class="px-4 py-3 text-slate-400 text-xs italic">Không có mô tả</td>
        <td class="px-4 py-3">
          <span class="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[12px]">
            ${docCount}
          </span>
        </td>
        <td class="px-4 py-3">
          <span class="badge badge--dark">Đang sử dụng</span>
        </td>
        <td class="px-4 py-3">
          <div class="flex items-center gap-2">
            <button
              class="btn-view-type w-8 h-8 grid place-items-center rounded-full hover:bg-slate-100"
              title="Xem chi tiết"
              data-type-id="${typeId}"
              data-type-name="${typeName}"
            >
              👁
            </button>
            <button
              class="btn-edit-type w-8 h-8 grid place-items-center rounded-full hover:bg-emerald-50 text-emerald-600"
              title="Sửa"
              data-type-id="${typeId}"
            >
              ✔
            </button>
            <button
              class="btn-view-docs w-8 h-8 grid place-items-center rounded-full hover:bg-blue-50 text-blue-600"
              title="Danh sách văn bản"
              data-type-id="${typeId}"
              data-type-name="${typeName}"
              data-doc-count="${docCount}"
            >
              🗂
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  function attachDocumentTypeActions() {
    // Nút xem danh sách văn bản
    document.querySelectorAll('.btn-view-docs').forEach(btn => {
      btn.addEventListener('click', () => {
        const typeId = btn.dataset.typeId;
        const typeName = btn.dataset.typeName;
        const docCount = btn.dataset.docCount;
        showDocumentListModal(typeId, typeName, docCount);
      });
    });

    // Nút xem chi tiết loại
    document.querySelectorAll('.btn-view-type').forEach(btn => {
      btn.addEventListener('click', () => {
        const typeId = btn.dataset.typeId;
        const typeName = btn.dataset.typeName;
        alert(`Xem chi tiết: ${typeName} (ID: ${typeId})`);
        // TODO: Implement detail view
      });
    });

    // Nút sửa
    document.querySelectorAll('.btn-edit-type').forEach(btn => {
      btn.addEventListener('click', () => {
        const typeId = btn.dataset.typeId;
        alert(`Chỉnh sửa loại văn bản ID: ${typeId}`);
        // TODO: Implement edit modal
      });
    });
  }

  // ========== LOAD FIELDS ==========
  async function loadFields() {
    const tbody = document.querySelector('#tb-fields');
    if (!tbody || tbody.dataset.loaded === 'true') return;

    tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-slate-500">Đang tải lĩnh vực...</td></tr>';

    try {
      const response = await fetch(`${API_BASE}/fields/?with_counts=1`, {
        headers: api ? api.getAuthHeaders() : {}
      });

      if (!response.ok) throw new Error('Failed to load fields');

      const fields = await response.json();
      
      if (!fields || fields.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-slate-500">Chưa có lĩnh vực nào</td></tr>';
        return;
      }

      tbody.dataset.loaded = 'true';
      console.log('[quantri-danhmuc] Fields loaded:', fields.length);
      // Keep existing static data for now
    } catch (error) {
      console.error('[quantri-danhmuc] Failed to load fields:', error);
    }
  }

  // ========== LOAD DOCUMENT STATUSES ==========
  async function loadDocumentStatuses() {
    const tbody = document.querySelector('#tb-statuses');
    if (!tbody || tbody.dataset.loaded === 'true') return;

    tbody.dataset.loaded = 'true';
    console.log('[quantri-danhmuc] Document statuses tab loaded');
    // Keep existing static data for now
  }

  // ========== DOCUMENT LIST MODAL ==========
  function initDocumentListModal() {
    // Modal sẽ được tạo động khi cần
    console.log('[quantri-danhmuc] Document list modal initialized');
  }

  async function showDocumentListModal(typeId, typeName, docCount) {
    // Tạo modal nếu chưa tồn tại
    let modal = document.getElementById('modal-document-list');
    if (!modal) {
      modal = createDocumentListModal();
      document.body.appendChild(modal);
    }

    // Cập nhật tiêu đề
    const title = modal.querySelector('#modal-doc-list-title');
    if (title) {
      title.textContent = `Danh sách văn bản - ${typeName}`;
    }

    const count = modal.querySelector('#modal-doc-count');
    if (count) {
      count.textContent = `${docCount} văn bản`;
    }

    // Load danh sách văn bản
    const tbody = modal.querySelector('#modal-doc-list-body');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-slate-500">Đang tải danh sách văn bản...</td></tr>';
    }

    // Hiển thị modal
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Load documents
    try {
      const response = await fetch(`/api/v1/documents/?document_type=${typeId}&page_size=50`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) throw new Error('Failed to load documents');

      const result = await response.json();
      const documents = result.items || result.results || result;

      if (!documents || documents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-slate-500">Không có văn bản nào thuộc loại này</td></tr>';
        return;
      }

      tbody.innerHTML = documents.map(doc => createDocumentRow(doc)).join('');
      console.log('[quantri-danhmuc] Documents loaded:', documents.length);
    } catch (error) {
      console.error('[quantri-danhmuc] Failed to load documents:', error);
      tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-rose-500">Lỗi tải danh sách văn bản</td></tr>';
    }
  }

  function createDocumentListModal() {
    const modal = document.createElement('div');
    modal.id = 'modal-document-list';
    modal.className = 'fixed inset-0 bg-black/50 z-50 hidden flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <header class="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 id="modal-doc-list-title" class="text-lg font-semibold text-slate-900">Danh sách văn bản</h3>
            <p id="modal-doc-count" class="text-sm text-slate-500 mt-0.5"></p>
          </div>
          <button id="btn-close-modal" class="w-8 h-8 rounded-lg hover:bg-slate-200 grid place-items-center text-slate-600">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </header>
        <div class="flex-1 overflow-auto">
          <table class="min-w-full text-[13px]">
            <thead class="bg-slate-50 text-slate-600 sticky top-0">
              <tr>
                <th class="px-4 py-3 text-left font-semibold">Số/Ký hiệu</th>
                <th class="px-4 py-3 text-left font-semibold">Trích yếu</th>
                <th class="px-4 py-3 text-left font-semibold">Ngày ban hành</th>
                <th class="px-4 py-3 text-left font-semibold">Trạng thái</th>
                <th class="px-4 py-3 text-left font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody id="modal-doc-list-body" class="divide-y divide-slate-100">
              <tr><td colspan="5" class="px-4 py-6 text-center text-slate-500">Đang tải...</td></tr>
            </tbody>
          </table>
        </div>
        <footer class="px-6 py-4 border-t border-slate-200 flex justify-end bg-slate-50">
          <button id="btn-close-modal-footer" class="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-sm font-medium">
            Đóng
          </button>
        </footer>
      </div>
    `;

    // Wire up close buttons
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeDocumentListModal();
      }
    });

    modal.querySelector('#btn-close-modal').addEventListener('click', closeDocumentListModal);
    modal.querySelector('#btn-close-modal-footer').addEventListener('click', closeDocumentListModal);

    return modal;
  }

  function closeDocumentListModal() {
    const modal = document.getElementById('modal-document-list');
    if (modal) {
      modal.classList.add('hidden');
      document.body.style.overflow = '';
    }
  }

  function createDocumentRow(doc) {
    const docId = doc.document_id || doc.id;
    const title = escapeHtml(doc.title || doc.summary || 'Không có tiêu đề');
    const docNumber = escapeHtml(doc.document_number || doc.number || '—');
    const issuedDate = doc.issued_date ? formatDate(doc.issued_date) : '—';
    const status = doc.status_display || doc.status || '—';
    const detailUrl = `/quantri/vanban-detail.html?id=${docId}`;

    return `
      <tr class="hover:bg-slate-50">
        <td class="px-4 py-3 font-mono text-[12px]">${docNumber}</td>
        <td class="px-4 py-3">
          <div class="line-clamp-2">${title}</div>
        </td>
        <td class="px-4 py-3 text-slate-600">${issuedDate}</td>
        <td class="px-4 py-3">
          <span class="badge badge--sm">${escapeHtml(status)}</span>
        </td>
        <td class="px-4 py-3">
          <a href="${detailUrl}" class="text-blue-600 hover:underline text-xs font-medium">
            Xem chi tiết
          </a>
        </td>
      </tr>
    `;
  }

  // ========== UTILITIES ==========
  function escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }

  function formatDate(dateString) {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    } catch (e) {
      return '—';
    }
  }

})();
