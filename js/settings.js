// Model Pricing Constants (per token, in USD)
export const MODEL_PRICING = {
  'gemini-3.5-flash': { input: 0.075 / 1000000, output: 0.30 / 1000000 },
  'gemini-3-flash': { input: 0.075 / 1000000, output: 0.30 / 1000000 },
  'gemini-3.1-flash-lite': { input: 0.030 / 1000000, output: 0.12 / 1000000 },
  'gemini-2.5-flash': { input: 0.075 / 1000000, output: 0.30 / 1000000 },
  'gemini-2.5-flash-lite': { input: 0.030 / 1000000, output: 0.12 / 1000000 },
  'gemma-4-26b-a4b-it': { input: 0.020 / 1000000, output: 0.08 / 1000000 },
  'gemma-4-31b-it': { input: 0.020 / 1000000, output: 0.08 / 1000000 },
  'nvidia/nemotron-4-340b-instruct': { input: 0.15 / 1000000, output: 0.60 / 1000000 },
  'meta/llama-3.1-405b-instruct': { input: 1.80 / 1000000, output: 1.80 / 1000000 },
  'meta/llama-3.3-70b-instruct': { input: 0.07 / 1000000, output: 0.28 / 1000000 },
  'mistralai/mixtral-8x22b-instruct': { input: 0.60 / 1000000, output: 0.60 / 1000000 },
  'mistralai/mixtral-8x22b-v0.1': { input: 0.60 / 1000000, output: 0.60 / 1000000 },
  'nvidia/llama-3.1-nemotron-70b-instruct': { input: 0.07 / 1000000, output: 0.28 / 1000000 },
  'openai/gpt-oss-120b': { input: 0.07 / 1000000, output: 0.28 / 1000000 },
};

// Rate Limits per Model
export const MODEL_LIMITS = {
  'gemini-3.5-flash': { rpm: 5, tpm: 250000, rpd: 20 },
  'gemini-3-flash': { rpm: 5, tpm: 250000, rpd: 20 },
  'gemini-3.1-flash-lite': { rpm: 15, tpm: 250000, rpd: 500 },
  'gemini-2.5-flash': { rpm: 5, tpm: 250000, rpd: 20 },
  'gemini-2.5-flash-lite': { rpm: 10, tpm: 250000, rpd: 20 },
  'gemma-4-26b-a4b-it': { rpm: 15, tpm: Infinity, rpd: 1500 },
  'gemma-4-31b-it': { rpm: 15, tpm: Infinity, rpd: 1500 }
};

const DEFAULT_PRICING = { input: 0.50 / 1000000, output: 1.50 / 1000000 };

export const settingsState = {
  googleKey: '',
  nvidiaKey: '',
  summaryProvider: 'auto', // 'auto', 'google', or 'nvidia'
  defaultModel: 'gemma-4-31b-it', // Default AI model on page load
  totalCost: 0.0,
  budgetLimit: 1.0,
  tokens: {
    google_in: 0,
    google_out: 0,
    nvidia_in: 0,
    nvidia_out: 0,
  },
  requestHistory: [], // Track requests for rate limit counting

  // Load state from local storage
  load() {
    try {
      const stored = localStorage.getItem('antigravity_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.googleKey = parsed.googleKey || '';
        this.nvidiaKey = parsed.nvidiaKey || '';
        this.summaryProvider = parsed.summaryProvider || 'auto';
        let defModel = parsed.defaultModel || 'gemma-4-31b-it';
        if (defModel === 'gemma-4-31b') defModel = 'gemma-4-31b-it';
        if (defModel === 'gemma-4-26b') defModel = 'gemma-4-26b-a4b-it';
        this.defaultModel = defModel;
        this.totalCost = parseFloat(parsed.totalCost) || 0.0;
        this.budgetLimit = parseFloat(parsed.budgetLimit) || 1.0;
        this.tokens = parsed.tokens || { google_in: 0, google_out: 0, nvidia_in: 0, nvidia_out: 0 };
        this.requestHistory = parsed.requestHistory || [];
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  },

  // Save state to local storage
  save() {
    try {
      const payload = {
        googleKey: this.googleKey,
        nvidiaKey: this.nvidiaKey,
        summaryProvider: this.summaryProvider,
        defaultModel: this.defaultModel,
        totalCost: this.totalCost,
        budgetLimit: this.budgetLimit,
        tokens: this.tokens,
        requestHistory: this.requestHistory
      };
      localStorage.setItem('antigravity_settings', JSON.stringify(payload));
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  },

  // Record a transactions token usage and cost
  addUsage(provider, model, inputTokens, outputTokens) {
    // 1. Update token accumulators
    if (provider === 'google') {
      this.tokens.google_in += inputTokens;
      this.tokens.google_out += outputTokens;
    } else if (provider === 'nvidia') {
      this.tokens.nvidia_in += inputTokens;
      this.tokens.nvidia_out += outputTokens;
    }

    // 2. Record request for rate limiting
    this.recordRequest(model, inputTokens + outputTokens);

    // 3. Calculate transaction cost
    const rates = MODEL_PRICING[model] || DEFAULT_PRICING;
    const cost = (inputTokens * rates.input) + (outputTokens * rates.output);
    this.totalCost += cost;

    // 4. Save to localStorage and update UI
    this.save();
    this.updateUI();

    return cost;
  },

  // Record a request timestamp and token count
  recordRequest(model, tokensCount) {
    this.requestHistory.push({
      model: model,
      timestamp: Date.now(),
      tokens: tokensCount
    });
    // Keep only last 24 hours of history to avoid filling localStorage
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    this.requestHistory = this.requestHistory.filter(r => r.timestamp > cutoff);
    this.save();
  },

  // Update live rate limits badge in chat header
  updateRateLimitUI(model) {
    const badge = document.getElementById('chat-live-rate-limit');
    if (!badge) return;

    const limits = MODEL_LIMITS[model];
    if (!limits) {
      badge.textContent = "Rate Limits: Server standard";
      badge.style.color = "var(--text-muted)";
      return;
    }

    // Filter history for current model in last 1 minute (for RPM/TPM) and last 24 hours (for RPD)
    const now = Date.now();
    const oneMinAgo = now - 60000;
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    const modelHistory = this.requestHistory.filter(r => r.model === model);
    const lastMinHistory = modelHistory.filter(r => r.timestamp > oneMinAgo);
    const lastDayHistory = modelHistory.filter(r => r.timestamp > oneDayAgo);

    const rpmUsed = lastMinHistory.length;
    const tpmUsed = lastMinHistory.reduce((sum, r) => sum + r.tokens, 0);
    const rpdUsed = lastDayHistory.length;

    const tpmLimitStr = limits.tpm === Infinity ? 'Unlimited' : `${Math.round(limits.tpm / 1000)}k`;
    const tpmUsedStr = tpmUsed >= 1000 ? `${(tpmUsed / 1000).toFixed(1)}k` : tpmUsed;

    badge.innerHTML = `RPM: <span style="font-weight:700">${rpmUsed}</span>/${limits.rpm} | TPM: <span style="font-weight:700">${tpmUsedStr}</span>/${tpmLimitStr} | RPD: <span style="font-weight:700">${rpdUsed}</span>/${limits.rpd}`;
    
    // Color alert levels
    if (rpmUsed >= limits.rpm || (limits.tpm !== Infinity && tpmUsed >= limits.tpm) || rpdUsed >= limits.rpd) {
      badge.style.color = "var(--accent-red)";
    } else if (rpmUsed >= limits.rpm * 0.7 || (limits.tpm !== Infinity && tpmUsed >= limits.tpm * 0.7) || rpdUsed >= limits.rpd * 0.7) {
      badge.style.color = "var(--accent-gold)";
    } else {
      badge.style.color = "var(--accent-green)";
    }
  },

  // Reset usage metrics
  resetUsage() {
    this.totalCost = 0.0;
    this.tokens = { google_in: 0, google_out: 0, nvidia_in: 0, nvidia_out: 0 };
    this.requestHistory = [];
    this.save();
    this.updateUI();
  },

  // Update UI cost displays
  updateUI() {
    const costStr = `$${this.totalCost.toFixed(5)}`;
    
    // Header ticker cost
    const tickerCost = document.getElementById('ticker-cost');
    if (tickerCost) {
      const valEl = tickerCost.querySelector('.ticker-val');
      if (valEl) valEl.textContent = costStr;
    }

    // Dashboard total spend
    const dashSpend = document.getElementById('stat-total-cost');
    if (dashSpend) dashSpend.textContent = costStr;

    // Settings panel costs
    const settingsSpend = document.getElementById('settings-total-cost');
    if (settingsSpend) settingsSpend.textContent = `${costStr} used`;

    // Update settings table numbers
    const sgIn = document.getElementById('tokens-google-in');
    if (sgIn) sgIn.textContent = this.tokens.google_in.toLocaleString();
    const sgOut = document.getElementById('tokens-google-out');
    if (sgOut) sgOut.textContent = this.tokens.google_out.toLocaleString();
    const snIn = document.getElementById('tokens-nvidia-in');
    if (snIn) snIn.textContent = this.tokens.nvidia_in.toLocaleString();
    const snOut = document.getElementById('tokens-nvidia-out');
    if (snOut) snOut.textContent = this.tokens.nvidia_out.toLocaleString();

    // Update live rate limits badge
    const modelSelector = document.getElementById('chat-model-selector');
    if (modelSelector) {
      this.updateRateLimitUI(modelSelector.value);
    }

    // Budget progress bar
    const budgetBar = document.getElementById('budget-progress-bar');
    if (budgetBar) {
      const pct = Math.min((this.totalCost / this.budgetLimit) * 100, 100);
      budgetBar.style.width = `${pct}%`;
      if (pct >= 90) {
        budgetBar.style.background = 'var(--accent-red)';
      } else {
        budgetBar.style.background = 'linear-gradient(to right, var(--accent-cyan), var(--accent-purple))';
      }
    }
  },

  // Try to load local configuration credentials
  async fetchLocalConfig() {
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const config = await response.json();
        if (config.nvidia_key) {
          const nvInput = document.getElementById('key-nvidia');
          if (nvInput && !nvInput.value.trim()) {
            nvInput.value = config.nvidia_key;
            // Highlight helper text
            const help = document.getElementById('nvidia-help-local');
            if (help) {
              help.innerHTML = `<span style="color: var(--accent-green)">✔ Pre-filled from local nvidia.sh file. Click 'Save' to apply.</span>`;
            }
          }
        }
      }
    } catch (e) {
      // Local dev config server endpoint not active
    }
  }
};
