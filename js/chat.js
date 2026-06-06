import { settingsState } from './settings.js';
import { sessionStats } from './app.js';

let messages = [];

document.addEventListener('DOMContentLoaded', () => {
  window.isAutoSwitching = false;

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
  const chatHistory = document.getElementById('chat-history');
  const chatTextarea = document.getElementById('chat-textarea');
  const chatSendBtn = document.getElementById('chat-send-btn');
  const modelSelector = document.getElementById('chat-model-selector');
  const activeModelNameLabel = document.getElementById('active-model-name-label');
  const activeProviderLabel = document.getElementById('active-provider-label');

  // Dashboard quick assistant elements
  const quickAiInput = document.getElementById('quick-ai-input');
  const quickAiBtn = document.getElementById('quick-ai-btn');

  // Inspector Elements
  const inspectLatency = document.getElementById('inspect-latency');
  const inspectCost = document.getElementById('inspect-cost');
  const inspectReqUrl = document.getElementById('inspect-req-url');
  const inspectReqBody = document.getElementById('inspect-req-body');
  const inspectResStatus = document.getElementById('inspect-res-status');
  const inspectResTokens = document.getElementById('inspect-res-tokens');
  const inspectResBody = document.getElementById('inspect-res-body');

  const inspectTabBtns = document.querySelectorAll('.inspect-tab-btn');
  const inspectTabContents = document.querySelectorAll('.inspect-tab-content');

  // 1. Model switching update labels
  if (modelSelector) {
    modelSelector.addEventListener('change', (e) => {
      const selectedModel = e.target.value;
      const optGroup = e.target.options[e.target.selectedIndex].parentNode.label;

      activeModelNameLabel.textContent = e.target.options[e.target.selectedIndex].text.split(' (')[0]; // strip limit text
      activeProviderLabel.textContent = optGroup.includes('Google') ? 'Google AI Free Tier' : 'Nvidia NIM Serverless';
      
      // Update live rate limits badge instantly
      settingsState.updateRateLimitUI(selectedModel);

      // Clear conversation when switching models manually (good practice)
      if (!window.isAutoSwitching) {
        clearChatHistory();
      }
    });

    // Initialize with saved default model on load
    if (settingsState.defaultModel) {
      modelSelector.value = settingsState.defaultModel;
    }

    // Trigger initial label update and rate limit display
    const selectedModel = modelSelector.value;
    const selectedOption = modelSelector.options[modelSelector.selectedIndex];
    if (selectedOption) {
      const optGroup = selectedOption.parentNode.label;
      activeModelNameLabel.textContent = selectedOption.text.split(' (')[0];
      activeProviderLabel.textContent = optGroup.includes('Google') ? 'Google AI Free Tier' : 'Nvidia NIM Serverless';
      settingsState.updateRateLimitUI(selectedModel);
    }
  }

  function clearChatHistory() {
    messages = [];
    chatHistory.innerHTML = `
      <div class="chat-msg system">
        <div class="msg-sender">System</div>
        <div class="msg-bubble">
          Switched model. Raw API Inspector details will refresh on the next message payload transaction.
        </div>
      </div>
    `;
  }

  // 2. Chat inspector tabs
  inspectTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-inspect-tab');
      
      inspectTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      inspectTabContents.forEach(content => {
        if (content.id === targetTab) {
          content.classList.add('active');
        } else {
          content.classList.remove('active');
        }
      });
    });
  });

  // 3. Send message event
  if (chatSendBtn && chatTextarea) {
    chatSendBtn.addEventListener('click', sendMessage);
    
    chatTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  async function sendMessage() {
    const text = chatTextarea.value.trim();
    if (!text) return;

    chatTextarea.value = '';

    // Append user message
    appendMessage('user', text);
    messages.push({ role: 'user', content: text });

    // Append loading bubble
    const loadingId = appendMessage('assistant', `<div class="loader"></div> Processing prompt...`);

    let currentModel = modelSelector.value;
    let isGoogle = currentModel.startsWith('gemini') || currentModel.startsWith('gemma');
    let provider = isGoogle ? 'google' : 'nvidia';
    let key = isGoogle ? settingsState.googleKey : settingsState.nvidiaKey;

    let retries = 0;
    const maxRetries = 3;
    let success = false;
    let finalError = "";

    while (retries < maxRetries && !success) {
      if (!key) {
        const loadingBubble = document.getElementById(loadingId);
        if (loadingBubble) {
          loadingBubble.querySelector('.msg-bubble').innerHTML = `<span style="color:var(--accent-red)">Error: Missing API key for ${isGoogle ? 'Google Gemini' : 'Nvidia NIM'}. Please navigate to the Settings tab to enter your credentials.</span>`;
        }
        return;
      }

      const startTime = Date.now();
      try {
        const chatResponse = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': key
          },
          body: JSON.stringify({
            provider,
            model: currentModel,
            messages,
            temperature: 0.7
          })
        });

        const latency = Date.now() - startTime;
        inspectLatency.textContent = `${latency} ms`;

        const respStatus = chatResponse.status;
        const respText = await chatResponse.text();

        // Check for rate limit error
        if (isRateLimitResponse(respStatus, respText)) {
          const nextModel = getNextFailoverModel(currentModel, isGoogle);
          console.warn(`Rate limit reached on ${currentModel}. Switching to ${nextModel}...`);
          
          if (window.showToast) {
            window.showToast(`Rate limit reached on ${currentModel.split('/').pop()}. Auto-switching to ${nextModel.split('/').pop()}...`, "warning");
          }

          // Programmatically change model selector (bypassing chat clear)
          window.isAutoSwitching = true;
          modelSelector.value = nextModel;
          modelSelector.dispatchEvent(new Event('change'));
          window.isAutoSwitching = false;

          // Update state variables for retry
          currentModel = nextModel;
          isGoogle = currentModel.startsWith('gemini') || currentModel.startsWith('gemma');
          provider = isGoogle ? 'google' : 'nvidia';
          key = isGoogle ? settingsState.googleKey : settingsState.nvidiaKey;

          retries++;
          continue;
        }

        if (!chatResponse.ok) {
          throw new Error(respText || "API response error");
        }

        const result = JSON.parse(respText);
        
        // Update loading bubble
        const loadingBubble = document.getElementById(loadingId);
        if (loadingBubble) {
          const bubble = loadingBubble.querySelector('.msg-bubble');
          if (result.content) {
            bubble.innerHTML = formatAIResponseText(result.content);
            messages.push({ role: 'model', content: result.content });
            success = true;
          } else {
            bubble.textContent = "Error: Received empty response content from backend.";
            success = true; // don't retry on empty content
          }
        }

        // Update Inspector Telemetry panel
        updateInspectorUI(result, latency);

        // Increment stats
        sessionStats.incrementChat();

      } catch (error) {
        console.error("Chat proxy error during fetch:", error);
        finalError = error.message;
        retries++;
      }
    }

    if (!success) {
      const loadingBubble = document.getElementById(loadingId);
      if (loadingBubble) {
        loadingBubble.querySelector('.msg-bubble').innerHTML = `<span style="color:var(--accent-red)">Failed to generate response after auto-failover retries. Error: ${finalError}</span>`;
      }
    }
  }

  // Helper: Append a message to chat history UI
  function appendMessage(sender, text) {
    const id = `msg-${Date.now()}`;
    const msgDiv = document.createElement('div');
    msgDiv.id = id;
    msgDiv.className = `chat-msg ${sender}`;
    msgDiv.innerHTML = `
      <div class="msg-sender">${sender === 'model' ? modelSelector.options[modelSelector.selectedIndex].text : sender}</div>
      <div class="msg-bubble">${text}</div>
    `;
    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    return id;
  }

  // Format AI response (handles basic line breaks and bold code markups)
  function formatAIResponseText(text) {
    // Escape HTML first
    let escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Replace bold syntax: **text** -> <strong>text</strong>
    escaped = escaped.replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>');
    
    // Replace backticks code blocks: `code` -> <code class="inline-code">code</code>
    escaped = escaped.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Replace linebreaks
    return escaped.replace(/\n/g, '<br>');
  }

  // 4. Update Inspector Telemetry UI
  function updateInspectorUI(result, latency) {
    // Calculate cost based on result tokens
    const model = modelSelector.value;
    const isGoogle = model.startsWith('gemini');
    const provider = isGoogle ? 'google' : 'nvidia';
    const inputT = result.tokens?.input || 0;
    const outputT = result.tokens?.output || 0;

    const cost = settingsState.addUsage(provider, model, inputT, outputT);
    inspectCost.textContent = `$${cost.toFixed(5)}`;

    // Show request details
    if (result.rawRequest) {
      inspectReqUrl.textContent = result.rawRequest.url;
      inspectReqBody.textContent = JSON.stringify(result.rawRequest.body, null, 2);
    }

    // Show response details
    if (result.rawResponse) {
      inspectResStatus.textContent = `${result.status || 200} ${result.status === 200 ? 'OK' : 'Error'}`;
      inspectResStatus.className = 'badge ' + (result.status === 200 ? 'price-up' : 'price-down');
      inspectResTokens.textContent = `In: ${inputT} | Out: ${outputT}`;
      inspectResBody.textContent = JSON.stringify(result.rawResponse.body, null, 2);
    }
  }

  // 5. Connect Dashboard Quick Assistant Box
  if (quickAiBtn && quickAiInput) {
    quickAiBtn.addEventListener('click', handleQuickAssistantSubmit);
    quickAiInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleQuickAssistantSubmit();
      }
    });
  }

  function handleQuickAssistantSubmit() {
    const text = quickAiInput.value.trim();
    if (!text) return;

    // Switch tab to AI Chat Console
    const chatNav = document.getElementById('nav-chat');
    if (chatNav) {
      chatNav.click();
      
      // Inject text to chat pane input and fire submit
      chatTextarea.value = text;
      sendMessage();

      // Clear dashboard quick helper input
      quickAiInput.value = '';
    }
  }
});
