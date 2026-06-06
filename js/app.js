import { settingsState } from './settings.js';
import './pdf-reader.js';
import './market.js';
import './news.js';
import './chat.js';

// Session counters
export const sessionStats = {
  chatCount: 0,
  pdfPagesRead: 0,
  
  incrementChat() {
    this.chatCount++;
    const el = document.getElementById('stat-chat-sessions');
    if (el) el.textContent = this.chatCount;
  },

  incrementPDFPages(pages = 1) {
    this.pdfPagesRead += pages;
    const el = document.getElementById('stat-read-pages');
    if (el) el.textContent = this.pdfPagesRead;
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize settings from localStorage
  settingsState.load();
  settingsState.updateUI();

  // Populate settings form inputs
  const googleInput = document.getElementById('key-google');
  if (googleInput) googleInput.value = settingsState.googleKey;
  
  const nvidiaInput = document.getElementById('key-nvidia');
  if (nvidiaInput) nvidiaInput.value = settingsState.nvidiaKey;

  const providerSelect = document.getElementById('news-summary-provider-select');
  if (providerSelect) providerSelect.value = settingsState.summaryProvider || 'auto';

  const defaultModelSelect = document.getElementById('settings-default-model-select');
  if (defaultModelSelect) defaultModelSelect.value = settingsState.defaultModel || 'gemma-4-31b-it';

  // 2. Fetch local dev config for pre-filling Nvidia key
  await settingsState.fetchLocalConfig();

  // 3. Render Lucide Icons
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // 4. Tab Navigation System
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      
      // Toggle nav active button
      tabs.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');

      // Toggle content panes
      const panes = document.querySelectorAll('.tab-content');
      panes.forEach(pane => {
        if (pane.id === targetTab) {
          pane.classList.add('active');
        } else {
          pane.classList.remove('active');
        }
      });

      // Handle tab-specific callbacks (like triggering layout refreshes)
      if (targetTab === 'market-tab') {
        window.dispatchEvent(new Event('market-tab-opened'));
      }
    });
  });

  // 5. Settings Save Action
  const saveBtn = document.getElementById('save-settings-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const googleVal = document.getElementById('key-google').value.trim();
      const nvidiaVal = document.getElementById('key-nvidia').value.trim();
      const providerVal = document.getElementById('news-summary-provider-select').value;
      const defaultModelVal = document.getElementById('settings-default-model-select').value;
      
      settingsState.googleKey = googleVal;
      settingsState.nvidiaKey = nvidiaVal;
      settingsState.summaryProvider = providerVal;
      settingsState.defaultModel = defaultModelVal;
      settingsState.save();

      // Show success message
      const statusEl = document.getElementById('save-settings-status');
      if (statusEl) {
        statusEl.innerHTML = `<span style="color: var(--accent-green)">✔ Settings saved successfully!</span>`;
        setTimeout(() => { statusEl.innerHTML = ''; }, 3000);
      }
    });
  }

  // 6. Reset Usage Action
  const resetBtn = document.getElementById('reset-cost-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm("Are you sure you want to reset all API cost and token usage stats?")) {
        settingsState.resetUsage();
      }
    });
  }

  // 7. Route Dashboard "View All News" button to News tab
  const viewNewsBtn = document.getElementById('dash-view-all-news');
  if (viewNewsBtn) {
    viewNewsBtn.addEventListener('click', () => {
      const newsNav = document.getElementById('nav-news');
      if (newsNav) newsNav.click();
    });
  }
});

// 8. Global Toast Notification System (Minimalist Y2K mix)
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-triangle';
  if (type === 'warning') iconName = 'alert-circle';
  
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="toast-icon"></i>
    <span class="toast-message">${message}</span>
  `;
  
  container.appendChild(toast);
  
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Animate slide-in
  setTimeout(() => {
    toast.classList.add('visible');
  }, 20);

  // Auto remove
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

window.showToast = showToast;
