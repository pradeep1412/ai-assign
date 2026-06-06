import { sessionStats } from './app.js';

// Setup PDF.js Worker
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
}

let pdfDoc = null;
let currentPageNum = 1;
let totalPages = 0;
let pageTextCache = {}; // Cache of extracted text per page
let currentViewMode = 'page'; // 'page' (original canvas) or 'text' (reflowed text)

// Podcast Narrator State
let synth = window.speechSynthesis;
let currentUtterance = null;
let isNarrating = false;
let currentSentenceIdx = 0;
let pageSentences = []; // List of sentences on the active page

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const dropZone = document.getElementById('pdf-drop-zone');
  const fileInput = document.getElementById('pdf-file-input');
  const pdfInfo = document.getElementById('pdf-info');
  const pdfName = document.getElementById('pdf-name');
  
  const readerPane = document.getElementById('reader-pane');
  const readerBody = document.getElementById('reader-body');
  const readerTitle = document.getElementById('reader-title');
  const pageIndicator = document.getElementById('reader-page-indicator');
  
  const prevPageBtn = document.getElementById('reader-prev-page');
  const nextPageBtn = document.getElementById('reader-next-page');

  // Kindle theme selectors
  const themeBtns = document.querySelectorAll('.theme-select-btn');
  const fontSelect = document.getElementById('reader-font-family');
  const fontDec = document.getElementById('font-dec');
  const fontInc = document.getElementById('font-inc');
  const fontSizeVal = document.getElementById('font-size-val');

  // Podcast controls
  const voiceSelect = document.getElementById('podcast-voice-select');
  const speedSlider = document.getElementById('podcast-speed');
  const speedVal = document.getElementById('podcast-speed-val');
  const playBtn = document.getElementById('podcast-play');
  const prevBtn = document.getElementById('podcast-prev');
  const nextBtn = document.getElementById('podcast-next');
  const visualizer = document.getElementById('podcast-visualizer');
  const currentPodcastPageLabel = document.getElementById('podcast-current-page');
  const totalPodcastPagesLabel = document.getElementById('podcast-total-pages');

  let fontSize = 16; // default 16px

  // 1. Drag & Drop file loaders
  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files.length > 0 && files[0].type === 'application/pdf') {
        loadPDFFile(files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        loadPDFFile(e.target.files[0]);
      }
    });
  }

  // 2. Load PDF document
  function loadPDFFile(file) {
    pdfName.textContent = file.name;
    pdfInfo.style.display = 'flex';
    readerTitle.textContent = file.name.replace(/\.[^/.]+$/, ""); // strip extension
    const workspace = document.querySelector('.pdf-workspace');
    if (workspace) workspace.classList.add('pdf-loaded');
    
    // Stop any active narration
    stopNarration();

    const reader = new FileReader();
    reader.onload = function(e) {
      const typedarray = new Uint8Array(e.target.result);
      
      window.pdfjsLib.getDocument(typedarray).promise.then(pdf => {
        pdfDoc = pdf;
        totalPages = pdf.numPages;
        currentPageNum = 1;
        pageTextCache = {};
        
        totalPodcastPagesLabel.textContent = totalPages;
        renderPage(currentPageNum);
      }).catch(err => {
        if (window.showToast) {
          window.showToast("Failed to parse PDF document. Please verify it is not corrupted.", "error");
        } else {
          alert("Failed to parse PDF document. Please verify it is not corrupted.");
        }
        console.error(err);
      });
    };
    reader.readAsArrayBuffer(file);
  }

  // 3. Render PDF Text Page
  async function renderPage(pageNum) {
    if (!pdfDoc) return;
    
    currentPageNum = pageNum;
    pageIndicator.textContent = `${currentPageNum} / ${totalPages}`;
    currentPodcastPageLabel.textContent = `Page ${currentPageNum}`;
    
    // Disable/enable arrows
    if (prevPageBtn) prevPageBtn.disabled = pageNum <= 1;
    if (nextPageBtn) nextPageBtn.disabled = pageNum >= totalPages;

    readerBody.innerHTML = `<div class="loader"></div><p style="text-align:center;color:var(--text-muted)">Loading page...</p>`;

    try {
      // 1. Extract text in the background (always runs for TTS podcast narration support)
      let pageText = pageTextCache[pageNum];
      let page = null;
      if (pageText === undefined) {
        page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        let lastY, text = "";
        for (let item of textContent.items) {
          if (lastY !== undefined && Math.abs(item.transform[5] - lastY) > 8) {
            text += "\n\n";
          }
          text += item.str + " ";
          lastY = item.transform[5];
        }

        // Simple text sanitization
        pageText = text.replace(/\s+/g, ' ').trim();
        pageTextCache[pageNum] = pageText;
      }

      // Populate pageSentences for speech synthesis (if any text exists)
      if (pageText.trim()) {
        pageSentences = pageText.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
      } else {
        pageSentences = [];
      }

      // 2. Render depending on the view mode
      if (currentViewMode === 'page') {
        readerBody.innerHTML = `<div class="loader"></div><p style="text-align:center;color:var(--text-muted)">Rendering page layout...</p>`;
        try {
          if (!page) {
            page = await pdfDoc.getPage(pageNum);
          }
          
          // Create canvas element
          const canvas = document.createElement('canvas');
          canvas.className = 'scanned-page-canvas';
          
          // Render page to canvas at 1.5x scale
          const viewport = page.getViewport({ scale: 1.5 });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
          readerBody.innerHTML = '';
          readerBody.appendChild(canvas);
          
          const context = canvas.getContext('2d');
          const renderContext = {
            canvasContext: context,
            viewport: viewport
          };
          
          await page.render(renderContext).promise;
          
          // If this page actually contains no text, notify the user that TTS won't work here
          if (!pageText.trim() && window.showToast) {
            window.showToast("Scanned image page loaded. TTS narration is unavailable.", "info");
          }
        } catch (renderErr) {
          console.error("Canvas render error:", renderErr);
          readerBody.innerHTML = `
            <div class="reader-empty-state">
              <i data-lucide="image" class="empty-icon"></i>
              <h3>Render Failed</h3>
              <p>We encountered an error rendering the original page image.</p>
            </div>
          `;
          if (window.lucide) window.lucide.createIcons();
          if (window.showToast) {
            window.showToast("Failed to render page image.", "error");
          }
        }
      } else {
        // Reflowable text view mode
        if (!pageText.trim()) {
          // If there is no selectable text on the page, fallback to rendering the original canvas
          readerBody.innerHTML = `<div class="loader"></div><p style="text-align:center;color:var(--text-muted)">No selectable text. Rendering page layout...</p>`;
          try {
            if (!page) {
              page = await pdfDoc.getPage(pageNum);
            }
            
            const canvas = document.createElement('canvas');
            canvas.className = 'scanned-page-canvas';
            const viewport = page.getViewport({ scale: 1.5 });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            
            readerBody.innerHTML = '';
            readerBody.appendChild(canvas);
            
            const context = canvas.getContext('2d');
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            
            if (window.showToast) {
              window.showToast("No selectable text on this page. Displaying original page layout.", "warning");
            }
          } catch (renderErr) {
            console.error("Fallback canvas render error:", renderErr);
            readerBody.innerHTML = `
              <div class="reader-empty-state">
                <i data-lucide="image" class="empty-icon"></i>
                <h3>Scanned Image Page</h3>
                <p>This page appears to contain only images or no selectable text.</p>
              </div>
            `;
            if (window.lucide) window.lucide.createIcons();
          }
          return;
        }

        // Render reflowable text with spans
        readerBody.innerHTML = pageSentences.map((sentence, idx) => {
          return `<span class="reader-sentence" id="sentence-${idx}">${sentence}</span>`;
        }).join('  ');

        // Sync narration cursor if we are currently narrating
        if (isNarrating) {
          currentSentenceIdx = 0;
          speakSentence();
        }
      }

      // Increment stats
      sessionStats.incrementPDFPages();

    } catch (error) {
      readerBody.innerHTML = `<p style="color:var(--accent-red)">Failed to load page. Error: ${error.message}</p>`;
    }
  }

  // 4. Page Navigators
  if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => {
      if (currentPageNum > 1) {
        renderPage(currentPageNum - 1);
      }
    });
  }
  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
      if (currentPageNum < totalPages) {
        renderPage(currentPageNum + 1);
      }
    });
  }

  // 5. Kindle reader style customizers
  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      themeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const selectedTheme = btn.getAttribute('data-theme');
      readerPane.className = `pdf-viewer-pane ${selectedTheme} ${fontSelect.value}`;
    });
  });

  if (fontSelect) {
    fontSelect.addEventListener('change', (e) => {
      const activeThemeBtn = document.querySelector('.theme-select-btn.active');
      const activeTheme = activeThemeBtn ? activeThemeBtn.getAttribute('data-theme') : 'light-read';
      readerPane.className = `pdf-viewer-pane ${activeTheme} ${e.target.value}`;
    });
  }

  if (fontDec && fontInc && fontSizeVal) {
    fontDec.addEventListener('click', () => {
      if (fontSize > 12) {
        fontSize -= 2;
        applyFontSize();
      }
    });
    fontInc.addEventListener('click', () => {
      if (fontSize < 28) {
        fontSize += 2;
        applyFontSize();
      }
    });
  }

  function applyFontSize() {
    fontSizeVal.textContent = `${fontSize}px`;
    readerBody.style.fontSize = `${fontSize}px`;
  }

  // View mode switcher (Original Page vs Reflow Text)
  const viewModeBtns = document.querySelectorAll('.view-mode-btn');
  viewModeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      viewModeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      currentViewMode = btn.getAttribute('data-view');
      renderPage(currentPageNum);
    });
  });

  // 6. SpeechSynthesis Narrator initialization
  function loadVoices() {
    if (!synth) return;
    const voices = synth.getVoices();
    voiceSelect.innerHTML = voices.map(voice => {
      const defaultLabel = voice.default ? ' (Default)' : '';
      return `<option value="${voice.name}">${voice.name} (${voice.lang})${defaultLabel}</option>`;
    }).join('');

    // Try to auto-select a good English voice
    const defaultVoiceIdx = voices.findIndex(v => v.lang.startsWith('en-') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha')));
    if (defaultVoiceIdx !== -1) {
      voiceSelect.selectedIndex = defaultVoiceIdx;
    }
  }

  // Chrome loads voices asynchronously
  if (synth) {
    loadVoices();
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = loadVoices;
    }
  }

  // Speed rate slider
  if (speedSlider && speedVal) {
    speedSlider.addEventListener('input', (e) => {
      speedVal.textContent = `${parseFloat(e.target.value).toFixed(1)}x`;
      // If narrating, restart current sentence with new speed
      if (isNarrating) {
        synth.cancel();
        speakSentence();
      }
    });
  }

  // Podcast controls
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (!pdfDoc) {
        if (window.showToast) {
          window.showToast("Please upload a PDF book first to start the podcast narration.", "warning");
        } else {
          alert("Please upload a PDF file first to start the podcast narration.");
        }
        return;
      }
      toggleNarration();
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentPageNum > 1) {
        stopNarration();
        renderPage(currentPageNum - 1).then(() => {
          startNarration();
        });
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (currentPageNum < totalPages) {
        stopNarration();
        renderPage(currentPageNum + 1).then(() => {
          startNarration();
        });
      }
    });
  }

  function toggleNarration() {
    if (isNarrating) {
      pauseNarration();
    } else {
      startNarration();
    }
  }

  function startNarration() {
    if (!synth || pageSentences.length === 0) return;
    isNarrating = true;
    
    // Play button icon to Pause
    playBtn.innerHTML = `<i data-lucide="pause"></i>`;
    if (window.lucide) window.lucide.createIcons();
    
    // Activate audio wave visualizer
    visualizer.classList.add('playing');
    document.getElementById('podcast-status').textContent = "Podcast streaming...";
    
    if (currentViewMode === 'page' && window.showToast) {
      window.showToast("Switch to 'Reflow Text' view to see synchronized text highlighting.", "info");
    }
    
    speakSentence();
  }

  function pauseNarration() {
    isNarrating = false;
    synth.cancel();
    
    // Pause button icon to Play
    playBtn.innerHTML = `<i data-lucide="play"></i>`;
    if (window.lucide) window.lucide.createIcons();
    
    // Deactivate audio wave visualizer
    visualizer.classList.remove('playing');
    document.getElementById('podcast-status').textContent = "Podcast paused";
  }

  function stopNarration() {
    isNarrating = false;
    if (synth) synth.cancel();
    currentSentenceIdx = 0;
    
    if (playBtn) {
      playBtn.innerHTML = `<i data-lucide="play"></i>`;
      if (window.lucide) window.lucide.createIcons();
    }
    if (visualizer) visualizer.classList.remove('playing');
    const status = document.getElementById('podcast-status');
    if (status) status.textContent = "Podcast stopped";

    // Clear all highlighted sentences
    const spans = document.querySelectorAll('.reader-sentence');
    spans.forEach(s => s.classList.remove('tts-highlight'));
  }

  // Core TTS engine: speak active sentence
  function speakSentence() {
    if (!isNarrating || currentSentenceIdx >= pageSentences.length) {
      // If we finished all sentences on this page, load next page automatically!
      if (currentSentenceIdx >= pageSentences.length && currentPageNum < totalPages) {
        renderPage(currentPageNum + 1).then(() => {
          currentSentenceIdx = 0;
          speakSentence();
        });
      } else {
        stopNarration();
      }
      return;
    }

    // Highlight active sentence in reader
    const spans = document.querySelectorAll('.reader-sentence');
    spans.forEach(s => s.classList.remove('tts-highlight'));
    
    const activeSpan = document.getElementById(`sentence-${currentSentenceIdx}`);
    if (activeSpan) {
      activeSpan.classList.add('tts-highlight');
      // Scroll text pane if necessary to keep active sentence visible
      activeSpan.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    const textToSpeak = pageSentences[currentSentenceIdx];
    currentUtterance = new SpeechSynthesisUtterance(textToSpeak);

    // Apply voice settings
    const selectedVoiceName = voiceSelect.value;
    const voices = synth.getVoices();
    const voice = voices.find(v => v.name === selectedVoiceName);
    if (voice) currentUtterance.voice = voice;

    // Apply speed settings
    currentUtterance.rate = parseFloat(speedSlider.value) || 1.0;

    // Handle end of speaking sentence
    currentUtterance.onend = () => {
      if (isNarrating) {
        currentSentenceIdx++;
        speakSentence();
      }
    };

    currentUtterance.onerror = (e) => {
      console.error("SpeechSynthesis error:", e);
      if (e.error !== 'interrupted') {
        stopNarration();
      }
    };

    // Chrome speechSynthesis keep-alive logic: cancels after 15 seconds if long text,
    // but because we speak sentence-by-sentence, sentences are short and this works perfectly!
    synth.speak(currentUtterance);
  }

  // Fullscreen support for reader-pane
  const fullscreenBtn = document.getElementById('reader-fullscreen-btn');
  if (fullscreenBtn && readerPane) {
    fullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        const requestFS = readerPane.requestFullscreen || readerPane.webkitRequestFullscreen;
        if (requestFS) {
          requestFS.call(readerPane).catch(err => {
            console.error(`Error entering fullscreen: ${err.message}`);
          });
        }
      } else {
        const exitFS = document.exitFullscreen || document.webkitExitFullscreen;
        if (exitFS) {
          exitFS.call(document);
        }
      }
    });

    const onFullscreenChange = () => {
      const isFS = document.fullscreenElement === readerPane || document.webkitFullscreenElement === readerPane;
      if (isFS) {
        fullscreenBtn.innerHTML = `<i data-lucide="minimize-2"></i>`;
        fullscreenBtn.title = "Exit Fullscreen";
      } else {
        fullscreenBtn.innerHTML = `<i data-lucide="maximize-2"></i>`;
        fullscreenBtn.title = "Toggle Fullscreen";
      }
      if (window.lucide) window.lucide.createIcons();
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  }
});
