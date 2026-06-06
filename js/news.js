import { settingsState } from './settings.js';

let newsArticles = [];

document.addEventListener('DOMContentLoaded', () => {
  const GOOGLE_FAILOVER_LIST = [
    'gemma-4-31b-it',
    'gemma-4-26b-a4b-it',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
    'gemini-3-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash'
  ];

  const NVIDIA_FAILOVER_LIST = [
    'nvidia/llama-3.1-nemotron-70b-instruct',
    'meta/llama-3.3-70b-instruct',
    'mistralai/mixtral-8x22b-v0.1',
    'openai/gpt-oss-120b'
  ];

  function getNextFailoverModel(currentModel, isGoogle) {
    const list = isGoogle ? GOOGLE_FAILOVER_LIST : NVIDIA_FAILOVER_LIST;
    const idx = list.indexOf(currentModel);
    if (idx === -1) {
      return list[0];
    }
    const nextIdx = (idx + 1) % list.length;
    return list[nextIdx];
  }

  function isRateLimitResponse(status, resultText) {
    if (status === 429) return true;
    const lower = (resultText || '').toLowerCase();
    return lower.includes("rate limit") || lower.includes("quota exceeded") || lower.includes("resource has been exhausted") || lower.includes("too many requests");
  }

  // Elements
  const dashNewsList = document.getElementById('dash-news-list');
  const newsFeedList = document.getElementById('news-feed-list');
  const refreshBtn = document.getElementById('news-refresh-btn');

  // Drawer Elements
  const drawer = document.getElementById('news-summary-drawer');
  const drawerClose = document.getElementById('summary-drawer-close');
  const drawerTitle = document.getElementById('summary-article-title');
  const drawerSource = document.getElementById('summary-article-source');
  const drawerDate = document.getElementById('summary-article-date');
  const drawerLink = document.getElementById('summary-original-link');
  const drawerContent = document.getElementById('summary-ai-text-content');
  const drawerCost = document.getElementById('summary-ai-cost');
  const drawerLoader = document.getElementById('summary-ai-loader');

  // Daily Digest Elements
  const digestLoader = document.getElementById('digest-loader');
  const digestContent = document.getElementById('digest-content');
  const digestIndiaText = document.getElementById('digest-india-text');
  const digestWorldText = document.getElementById('digest-world-text');
  const digestCost = document.getElementById('digest-ai-cost');
  const digestNoKey = document.getElementById('digest-no-key');
  const digestRegenBtn = document.getElementById('digest-regenerate-btn');

  // 1. Fetch News from Vercel Serverless
  async function fetchNewsFeed() {
    // Show skeleton loaders
    if (newsFeedList) {
      newsFeedList.innerHTML = `
        <div class="news-skeleton"></div>
        <div class="news-skeleton"></div>
        <div class="news-skeleton"></div>
      `;
    }

    try {
      const response = await fetch('/api/news');
      if (!response.ok) throw new Error("Failed to fetch news feed");

      const data = await response.json();
      newsArticles = data.news || [];
      renderNewsUI();
      // Auto-generate digest after loading news
      generateDailyDigest();
    } catch (error) {
      console.error("News load error:", error);
      if (newsFeedList) {
        newsFeedList.innerHTML = `<p style="grid-column: span 2; text-align:center; color: var(--accent-red)">Error loading news feed. Please try refreshing.</p>`;
      }
    }
  }

  // 2. Render News UI
  function renderNewsUI() {
    if (newsArticles.length === 0) return;

    // Render Dashboard headlines (limit to 5)
    if (dashNewsList) {
      dashNewsList.innerHTML = newsArticles.slice(0, 5).map(article => `
        <div class="brief-item">
          <div>${article.title}</div>
          <div class="brief-meta">
            <span>${article.source}</span>
            <span>•</span>
            <span>${formatTimeAgo(article.pubDate)}</span>
          </div>
        </div>
      `).join('');
    }

    // Render News Tab cards (full 15 articles)
    if (newsFeedList) {
      newsFeedList.innerHTML = newsArticles.map((article, index) => `
        <div class="grid-card news-card">
          <div>
            <div class="news-card-title">${article.title}</div>
            <div class="brief-meta">
              <span class="badge bg-neutral">${article.source}</span>
              <span>${formatTimeAgo(article.pubDate)}</span>
            </div>
          </div>
          <div class="news-card-footer">
            <button class="primary-btn summarize-btn" data-index="${index}">
              <i data-lucide="sparkles"></i> AI Summarize
            </button>
            <a href="${article.link}" target="_blank" class="text-btn">Read Full Article</a>
          </div>
        </div>
      `).join('');

      // Add Summarize listeners
      const sumBtns = newsFeedList.querySelectorAll('.summarize-btn');
      sumBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = btn.getAttribute('data-index');
          summarizeArticle(newsArticles[idx]);
        });
      });

      // Render icons inside buttons
      if (window.lucide) window.lucide.createIcons();
    }
  }

  // Helper: Format PubDate to relative time ago
  function formatTimeAgo(dateStr) {
    try {
      const pub = new Date(dateStr);
      const diff = new Date() - pub;
      const hours = Math.floor(diff / 3600000);
      if (hours < 1) {
        const mins = Math.floor(diff / 60000);
        return `${mins <= 0 ? 'Just now' : `${mins}m ago`}`;
      }
      if (hours >= 24) {
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
      }
      return `${hours}h ago`;
    } catch (e) {
      return dateStr;
    }
  }

  // ===== DAILY DIGEST =====

  // Resolve active AI provider and model
  function resolveAIConfig() {
    const modelSelector = document.getElementById('chat-model-selector');
    let activeProvider = settingsState.summaryProvider || 'auto';

    if (activeProvider === 'auto') {
      const selectedOption = modelSelector ? modelSelector.options[modelSelector.selectedIndex] : null;
      const optGroupLabel = selectedOption ? (selectedOption.parentNode.label || '') : '';

      if (optGroupLabel.includes('Google') && settingsState.googleKey) {
        activeProvider = 'google';
      } else if (optGroupLabel.includes('Nvidia') && settingsState.nvidiaKey) {
        activeProvider = 'nvidia';
      } else {
        activeProvider = settingsState.googleKey ? 'google' : (settingsState.nvidiaKey ? 'nvidia' : null);
      }
    }

    let activeKey = activeProvider === 'nvidia' ? settingsState.nvidiaKey : settingsState.googleKey;
    let activeModel = '';

    if (activeProvider === 'nvidia') {
      activeModel = (modelSelector && (modelSelector.value.startsWith('nvidia/') || modelSelector.value.startsWith('meta/') || modelSelector.value.startsWith('mistralai/') || modelSelector.value.startsWith('openai/')))
        ? modelSelector.value
        : 'nvidia/llama-3.1-nemotron-70b-instruct';
    } else {
      activeModel = (modelSelector && (modelSelector.value.startsWith('gemini-') || modelSelector.value.startsWith('gemma-')))
        ? modelSelector.value
        : 'gemini-3.5-flash';
    }

    return { activeProvider, activeKey, activeModel };
  }

  async function generateDailyDigest() {
    if (newsArticles.length === 0) return;

    const { activeProvider, activeKey, activeModel: initialModel } = resolveAIConfig();

    // Show/hide appropriate sections
    if (!activeKey) {
      if (digestLoader) digestLoader.style.display = 'none';
      if (digestContent) digestContent.style.display = 'none';
      if (digestNoKey) digestNoKey.style.display = 'block';
      return;
    }

    if (digestNoKey) digestNoKey.style.display = 'none';
    if (digestContent) digestContent.style.display = 'none';
    if (digestLoader) digestLoader.style.display = 'flex';

    // Build headlines list for the prompt
    const headlinesList = newsArticles.map((a, i) => `${i + 1}. "${a.title}" — ${a.source}`).join('\n');

    const prompt = `You are a news analyst. Below are today's top headlines from India (Google News India RSS feed).

Headlines:
${headlinesList}

Please provide a daily digest summary in TWO categories:

**INDIA:**
- Write 3-4 concise bullet points summarizing the key India-related news themes.

**WORLD & OTHER:**
- Write 2-3 concise bullet points summarizing any international or non-India-specific news themes.

Rules:
- Each bullet point should be 1 sentence max, under 20 words.
- If all headlines are India-focused, write "No major international headlines today." under WORLD.
- Return ONLY the two sections with bullet points, no extra commentary.
- Use "•" as bullet character.`;

    let activeModel = initialModel;
    let retries = 0;
    const maxRetries = 3;
    let success = false;
    let finalError = '';

    while (retries < maxRetries && !success) {
      try {
        const chatResponse = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': activeKey
          },
          body: JSON.stringify({
            provider: activeProvider,
            model: activeModel,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3
          })
        });

        const respStatus = chatResponse.status;
        const respText = await chatResponse.text();

        if (isRateLimitResponse(respStatus, respText)) {
          const isGoogle = activeProvider === 'google';
          const nextModel = getNextFailoverModel(activeModel, isGoogle);
          console.warn(`Digest: Rate limit on ${activeModel}. Switching to ${nextModel}...`);
          if (window.showToast) {
            window.showToast(`Digest rate limit on ${activeModel.split('/').pop()}. Switching to ${nextModel.split('/').pop()}...`, "warning");
          }
          activeModel = nextModel;
          retries++;
          continue;
        }

        if (!chatResponse.ok) {
          throw new Error(respText || 'Digest AI call failed');
        }

        const result = JSON.parse(respText);

        if (result.content) {
          // Parse the two sections from AI response
          const parsed = parseDigestSections(result.content);
          if (digestIndiaText) digestIndiaText.innerHTML = parsed.india;
          if (digestWorldText) digestWorldText.innerHTML = parsed.world;
          if (digestLoader) digestLoader.style.display = 'none';
          if (digestContent) digestContent.style.display = 'flex';

          // Track cost
          const inputT = result.tokens?.input || 0;
          const outputT = result.tokens?.output || 0;
          const cost = settingsState.addUsage(activeProvider, activeModel, inputT, outputT);
          if (digestCost) digestCost.textContent = `$${cost.toFixed(4)}`;

          success = true;
        } else {
          throw new Error('Empty AI response for digest');
        }

      } catch (error) {
        console.error('Digest generation error:', error);
        finalError = error.message;
        retries++;
      }
    }

    if (!success) {
      if (digestLoader) digestLoader.style.display = 'none';
      if (digestContent) {
        digestContent.style.display = 'flex';
        if (digestIndiaText) digestIndiaText.innerHTML = `<p style="color:var(--accent-red)">Failed to generate digest. ${finalError}</p>`;
        if (digestWorldText) digestWorldText.innerHTML = '';
      }
    }
  }

  // Parse AI response into India and World sections
  function parseDigestSections(text) {
    let indiaHTML = '';
    let worldHTML = '';

    // Try to split by section headers
    const indiaMatch = text.match(/\*?\*?INDIA:?\*?\*?\s*([\s\S]*?)(?=\*?\*?WORLD|$)/i);
    const worldMatch = text.match(/\*?\*?WORLD[^:]*:?\*?\*?\s*([\s\S]*?)$/i);

    if (indiaMatch && indiaMatch[1]) {
      indiaHTML = formatBullets(indiaMatch[1]);
    }
    if (worldMatch && worldMatch[1]) {
      worldHTML = formatBullets(worldMatch[1]);
    }

    // Fallback: if parsing failed, put everything in India
    if (!indiaHTML && !worldHTML) {
      indiaHTML = formatBullets(text);
      worldHTML = '<p style="color:var(--text-muted)">No separate world section detected.</p>';
    }

    return { india: indiaHTML, world: worldHTML };
  }

  function formatBullets(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const items = lines
      .filter(line => /^[-*•▸\d.]/.test(line) || line.length > 10)
      .map(line => {
        const cleaned = line.replace(/^[-*•▸\d.\s]+/, '').trim();
        if (!cleaned) return '';
        return `<li>${cleaned}</li>`;
      })
      .filter(Boolean);

    if (items.length === 0) return `<p style="color:var(--text-muted)">${text}</p>`;
    return `<ul>${items.join('')}</ul>`;
  }

  // ===== PER-ARTICLE SUMMARIZE =====

  async function summarizeArticle(article) {
    const { activeProvider, activeKey, activeModel: initialModel } = resolveAIConfig();

    if (!activeKey) {
      alert("Please configure either Google Gemini or Nvidia API key in the Settings tab to summarize articles.");
      const settingsNav = document.getElementById('nav-settings');
      if (settingsNav) settingsNav.click();
      return;
    }

    // Configure summary drawer UI
    drawerTitle.textContent = article.title;
    drawerSource.textContent = article.source;
    drawerDate.textContent = new Date(article.pubDate).toLocaleString();
    drawerLink.href = article.link;
    drawerContent.style.display = 'none';
    drawerCost.textContent = '$0.00000';

    drawerLoader.style.display = 'flex';
    drawer.style.display = 'flex';

    const prompt = `Please provide a 3-bullet point summary of this news article headline: "${article.title}". Keep it extremely concise, daily-brief style, under 100 words. Return only the bullet points.`;

    let activeModel = initialModel;
    let retries = 0;
    const maxRetries = 3;
    let success = false;
    let finalError = "";

    while (retries < maxRetries && !success) {
      try {
        const chatResponse = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': activeKey
          },
          body: JSON.stringify({
            provider: activeProvider,
            model: activeModel,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3
          })
        });

        const respStatus = chatResponse.status;
        const respText = await chatResponse.text();

        // Check for rate limit error
        if (isRateLimitResponse(respStatus, respText)) {
          const isGoogle = activeProvider === 'google';
          const nextModel = getNextFailoverModel(activeModel, isGoogle);
          console.warn(`Rate limit reached on ${activeModel}. Switching to ${nextModel}...`);

          if (window.showToast) {
            window.showToast(`Rate limit reached on ${activeModel.split('/').pop()}. Auto-switching to ${nextModel.split('/').pop()}...`, "warning");
          }

          // Programmatically change model selector (bypassing chat clear)
          const modelSelector = document.getElementById('chat-model-selector');
          if (modelSelector) {
            window.isAutoSwitching = true;
            modelSelector.value = nextModel;
            modelSelector.dispatchEvent(new Event('change'));
            window.isAutoSwitching = false;
          }

          activeModel = nextModel;
          retries++;
          continue;
        }

        if (!chatResponse.ok) {
          throw new Error(respText || "AI summarization failed");
        }

        const result = JSON.parse(respText);
        drawerLoader.style.display = 'none';

        if (result.content) {
          const formatted = formatSummaryText(result.content);
          drawerContent.innerHTML = formatted;
          drawerContent.style.display = 'block';

          const inputT = result.tokens?.input || 0;
          const outputT = result.tokens?.output || 0;
          const cost = settingsState.addUsage(activeProvider, activeModel, inputT, outputT);
          drawerCost.textContent = `$${cost.toFixed(5)}`;
          success = true;
        } else {
          drawerContent.innerHTML = `<p style="color:var(--accent-red)">Failed to generate summary from AI. Raw response: ${JSON.stringify(result)}</p>`;
          drawerContent.style.display = 'block';
          success = true;
        }

      } catch (error) {
        console.error("AI summarizer proxy error during fetch:", error);
        finalError = error.message;
        retries++;
      }
    }

    if (!success) {
      drawerLoader.style.display = 'none';
      drawerContent.innerHTML = `<p style="color:var(--accent-red)">Failed to connect to AI summary service after auto-failover retries. Error: ${finalError}</p>`;
      drawerContent.style.display = 'block';
    }
  }

  // Format summary bullet points nicely to HTML
  function formatSummaryText(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const items = lines.map(line => {
      const cleaned = line.replace(/^[-*•\d\.\s]+/, '');
      return `<li>${cleaned}</li>`;
    });
    return `<ul>${items.join('')}</ul>`;
  }

  // Drawer controls
  if (drawerClose) {
    drawerClose.addEventListener('click', () => {
      drawer.style.display = 'none';
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', fetchNewsFeed);
  }

  // Regenerate digest button
  if (digestRegenBtn) {
    digestRegenBtn.addEventListener('click', () => {
      generateDailyDigest();
    });
  }

  // Load initially
  fetchNewsFeed();
});
