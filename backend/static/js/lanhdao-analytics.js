/**
 * lanhdao-analytics.js
 * Module for handling Analytics & Reporting page logic for Leader role.
 */

(function () {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  // State
  const state = {
    scope: 'all',
    range: 'month',
    charts: {}
  };

  // Main entry point with Chart.js availability check
  window.initLanhDaoAnalytics = function () {
    console.info('[lanhdao-analytics] Initializing...');
    
    // Check if Chart.js is loaded
    if (!window.Chart) {
      console.error('[lanhdao-analytics] Chart.js not loaded! Retrying...');
      let retries = 0;
      const maxRetries = 10;
      const retryInterval = setInterval(() => {
        retries++;
        if (window.Chart) {
          console.info('[lanhdao-analytics] Chart.js loaded after', retries, 'attempts');
          clearInterval(retryInterval);
          setupFilters();
          loadAllData();
        } else if (retries >= maxRetries) {
          console.error('[lanhdao-analytics] Chart.js failed to load after', maxRetries, 'attempts');
          clearInterval(retryInterval);
        }
      }, 300);
      return;
    }
    
    console.info('[lanhdao-analytics] Chart.js available, proceeding...');
    setupFilters();
    loadAllData();
  };

  function setupFilters() {
    const scopeEl = $('#reportScope');
    const rangeEl = $('#reportRange');
    const btnPick = $('#btnPickRange');

    scopeEl?.addEventListener('change', () => {
      state.scope = scopeEl.value;
      loadAllData();
    });

    rangeEl?.addEventListener('change', () => {
      state.range = rangeEl.value;
      loadAllData();
    });

    btnPick?.addEventListener('click', () => {
      window.AdminApp?.showToast('Tính năng chọn ngày tùy chỉnh đang phát triển.', 'info');
    });
  }

  function loadAllData() {
    // Calculate dates based on range
    const { dateFrom, dateTo } = getDateRange(state.range);
    
    loadKPIs(dateFrom, dateTo);
    loadCharts(dateFrom, dateTo);
  }

  function getDateRange(range) {
    const end = new Date();
    const start = new Date();
    
    switch (range) {
      case 'month':
        start.setDate(1);
        break;
      case 'quarter':
        start.setMonth(Math.floor(start.getMonth() / 3) * 3);
        start.setDate(1);
        break;
      case 'year':
        start.setMonth(0);
        start.setDate(1);
        break;
      case 'last6':
        start.setMonth(start.getMonth() - 6);
        break;
      default:
        start.setDate(1);
    }
    
    return {
      dateFrom: start.toISOString().split('T')[0],
      dateTo: end.toISOString().split('T')[0]
    };
  }

  async function loadKPIs(dateFrom, dateTo) {
    console.info('[lanhdao-analytics] loadKPIs called with:', { dateFrom, dateTo, scope: state.scope });
    if (!window.ApiClient) {
      console.error('[lanhdao-analytics] ApiClient not available in loadKPIs!');
      return;
    }
    
    try {
      const response = await window.ApiClient.request('/api/v1/analytics/dashboard', {
        method: 'GET',
        params: { date_from: dateFrom, date_to: dateTo, scope: state.scope }
      });

      console.info('[lanhdao-analytics] KPIs response:', response);
      if (response && response.success && response.data) {
        updateKPIUI(response.data);
      } else {
        console.warn('[lanhdao-analytics] Invalid KPI response:', response);
      }
    } catch (error) {
      console.error('[lanhdao-analytics] Load KPIs failed', error);
    }
  }

  function updateKPIUI(data) {
    const { processing_efficiency, overdue_rate, total_documents } = data;

    // Completion Rate
    const kpiCompleteRate = $('#kpiCompleteRate');
    if (kpiCompleteRate && processing_efficiency) {
      window.AdminApp?.animateValue(kpiCompleteRate, processing_efficiency.rate, { decimals: 0, suffix: '%' });
    }

    // On Time Rate (100 - overdue rate as proxy)
    const kpiOnTime = $('#kpiOnTime');
    if (kpiOnTime && overdue_rate) {
      const onTime = Math.max(0, 100 - overdue_rate.rate);
      window.AdminApp?.animateValue(kpiOnTime, onTime, { decimals: 0, suffix: '%' });
    }

    // Docs Processed
    const docDone = $('#docDone');
    const docTotal = $('#docTotal');
    if (docDone && docTotal && processing_efficiency) {
      docDone.textContent = processing_efficiency.completed;
      docTotal.textContent = processing_efficiency.total;
    }

    // Late Tasks (Overdue docs)
    const taskLate = $('#taskLate');
    if (taskLate && overdue_rate) {
      window.AdminApp?.animateValue(taskLate, overdue_rate.count);
    }
  }

  async function loadCharts(dateFrom, dateTo) {
    console.info('[lanhdao-analytics] loadCharts called with:', { dateFrom, dateTo, scope: state.scope });
    
    if (!window.Chart) {
      console.error('[lanhdao-analytics] Chart.js not available in loadCharts!');
      return;
    }
    
    if (!window.ApiClient) {
      console.error('[lanhdao-analytics] ApiClient not available!');
      return;
    }

    // 1. Bar Docs - Activity Timeline
    try {
      console.info('[lanhdao-analytics] Fetching barDocs data...');
      const res = await window.ApiClient.request('/api/v1/analytics/activity/timeline', {
        params: { date_from: dateFrom, date_to: dateTo, period: 'month', metric: 'documents', scope: state.scope }
      });
      console.info('[lanhdao-analytics] barDocs response:', res);
      if (res && res.success && res.data) {
        renderBarChart('barDocs', res.data);
      } else {
        console.warn('[lanhdao-analytics] barDocs invalid response:', res);
      }
    } catch (e) { 
      console.error('[lanhdao-analytics] Chart barDocs failed:', e); 
    }

    // 2. Pie Tasks - Status Distribution (NO date filter)
    try {
      console.info('[lanhdao-analytics] Fetching pieTasks data...');
      const res = await window.ApiClient.request('/api/v1/analytics/documents/by-status', {
        params: { scope: state.scope }
      });
      console.info('[lanhdao-analytics] pieTasks response:', res);
      if (res && res.success && res.data) {
        renderPieChart('pieTasks', res.data);
      } else {
        console.warn('[lanhdao-analytics] pieTasks invalid response:', res);
      }
    } catch (e) { 
      console.error('[lanhdao-analytics] Chart pieTasks failed:', e); 
    }

    // 3. Line Perf - Activity Timeline (Weekly)
    try {
      console.info('[lanhdao-analytics] Fetching linePerf data...');
      const res = await window.ApiClient.request('/api/v1/analytics/activity/timeline', {
        params: { date_from: dateFrom, date_to: dateTo, period: 'week', metric: 'documents', scope: state.scope }
      });
      console.info('[lanhdao-analytics] linePerf response:', res);
      if (res && res.success && res.data) {
        renderLineChart('linePerf', res.data);
      } else {
        console.warn('[lanhdao-analytics] linePerf invalid response:', res);
      }
    } catch (e) { 
      console.error('[lanhdao-analytics] Chart linePerf failed:', e); 
    }
  }

  function renderBarChart(canvasId, data) {
    console.info('[lanhdao-analytics] renderBarChart called for:', canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) {
      console.error('[lanhdao-analytics] Canvas element not found:', canvasId);
      return;
    }
    if (!data || !data.labels || !data.datasets || !data.datasets[0]) {
      console.error('[lanhdao-analytics] Invalid data for barChart:', data);
      return;
    }
    destroyChart(canvasId);

    state.charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Văn bản',
          data: data.datasets[0].data,
          backgroundColor: '#3b82f6',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  function renderPieChart(canvasId, data) {
    console.info('[lanhdao-analytics] renderPieChart called for:', canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) {
      console.error('[lanhdao-analytics] Canvas element not found:', canvasId);
      return;
    }
    
    destroyChart(canvasId);
    
    // Handle empty data
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.warn('[lanhdao-analytics] No data for pieChart, showing placeholder:', canvasId);
      state.charts[canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Không có dữ liệu'],
          datasets: [{
            data: [1],
            backgroundColor: ['#e2e8f0'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { 
            legend: { position: 'right' },
            tooltip: { enabled: false }
          }
        }
      });
      return;
    }

    // data is [{status: '...', count: ...}]
    const labels = data.map(d => d.status);
    const values = data.map(d => d.count);
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6'];

    state.charts[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: colors.slice(0, values.length),
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'right' } }
      }
    });
  }

  function renderLineChart(canvasId, data) {
    console.info('[lanhdao-analytics] renderLineChart called for:', canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) {
      console.error('[lanhdao-analytics] Canvas element not found:', canvasId);
      return;
    }
    if (!data || !data.labels || !data.datasets || !data.datasets[0]) {
      console.error('[lanhdao-analytics] Invalid data for lineChart:', data);
      return;
    }
    destroyChart(canvasId);

    state.charts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Hoạt động',
          data: data.datasets[0].data,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  function destroyChart(id) {
    if (state.charts[id]) {
      state.charts[id].destroy();
      delete state.charts[id];
    }
  }

})();
