import { settingsState } from './settings.js?v=1.1';
import { sessionStats } from './app.js?v=1.3';

let goldRate24kPerGram = 0.0;
let goldRate22kPerGram = 0.0;
let usdInrRate = 83.50;

document.addEventListener('DOMContentLoaded', () => {
  let activeChartAsset = 'nifty';
  let lastFetchedData = null;

  // Elements
  const tickerNifty = document.getElementById('ticker-nifty');
  const tickerGold = document.getElementById('ticker-gold');
  const tickerUsd = document.getElementById('ticker-usd');

  // Dashboard Tab Elements
  const dashGold24k = document.getElementById('dash-gold-24k');
  const dashGold22k = document.getElementById('dash-gold-22k');
  const needle = document.getElementById('sentiment-needle');
  const sentimentVal = document.getElementById('sentiment-value');
  const sentimentRsi = document.getElementById('sentiment-rsi');
  const sentimentSma = document.getElementById('sentiment-sma');
  const sentimentRec = document.getElementById('sentiment-rec');

  // Market Tab Elements
  const mNiftyPrice = document.getElementById('market-nifty-price');
  const mNiftyChange = document.getElementById('market-nifty-change');
  const mGoldPriceUsd = document.getElementById('market-gold-price-usd');
  const mGoldChangeUsd = document.getElementById('market-gold-change-usd');
  const mUsdPrice = document.getElementById('market-usd-price');
  const mUsdChange = document.getElementById('market-usd-change');

  // Gold Calculator Elements
  const calcWeight = document.getElementById('gold-calc-weight');
  const calcKarat = document.getElementById('gold-calc-karat');
  const calcMaking = document.getElementById('gold-calc-making');
  const calcResultPrice = document.getElementById('gold-calc-result-price');

  // Market Advisory elements
  const advRsiVal = document.getElementById('adv-rsi-val');
  const advSmaVal = document.getElementById('adv-sma-val');
  const advStrategyVal = document.getElementById('adv-strategy-val');
  const advisoryGauge = document.getElementById('advisory-gauge');
  const advisoryGaugeStatus = document.getElementById('advisory-gauge-status');

  // 1. Fetch live market telemetry
  async function fetchMarketData() {
    try {
      const city = localStorage.getItem('selected_gold_city') || 'bangalore';
      const response = await fetch(`/api/market?city=${city}`);
      if (!response.ok) throw new Error("Failed to fetch market rates");
      
      const data = await response.json();
      
      // Validation: Ensure Nifty and Gold prices are positive and numeric before displaying
      if (!data || 
          typeof data.nifty50?.price !== 'number' || data.nifty50.price <= 0 ||
          (typeof data.gold?.priceINR_1g_24k !== 'number' && typeof data.gold?.priceINR_10g_24k !== 'number')) {
        throw new Error("Invalid API payload returned from market");
      }
      
      // Store in localStorage cache
      localStorage.setItem('cached_market_data', JSON.stringify(data));
      lastFetchedData = data;
      updateMarketUI(data);
      checkPriceAlerts(data);
    } catch (error) {
      console.error("Market fetch error, trying local cache:", error);
      const cached = localStorage.getItem('cached_market_data');
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          lastFetchedData = cachedData;
          updateMarketUI(cachedData, true);
        } catch (e) {
          console.error("Cache parse error", e);
        }
      }
    }
  }

  // 2. Update UI widgets
  function updateMarketUI(data, isCached = false) {
    // Save rates for calculator
    usdInrRate = data.usdInr.rate;
    // Calculate rates per gram
    goldRate24kPerGram = data.gold.priceINR_1g_24k || (data.gold.priceINR_10g_24k / 10);
    goldRate22kPerGram = data.gold.priceINR_1g_22k || (data.gold.priceINR_10g_22k / 10);

    // Format currency helpers
    const fmtINR = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);
    const fmtUSD = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

    // a. Update Tickers (Header)
    if (tickerNifty) {
      const val = tickerNifty.querySelector('.ticker-val');
      const pct = tickerNifty.querySelector('.ticker-pct');
      val.textContent = data.nifty50.price.toLocaleString('en-IN');
      pct.textContent = `${data.nifty50.changePercent >= 0 ? '+' : ''}${data.nifty50.changePercent}%`;
      
      val.className = 'ticker-val ' + (data.nifty50.change >= 0 ? 'price-up' : 'price-down');
      pct.className = 'ticker-pct ' + (data.nifty50.change >= 0 ? 'price-up' : 'price-down');
    }

    if (tickerGold) {
      const val = tickerGold.querySelector('.ticker-val');
      val.textContent = fmtINR(goldRate24kPerGram);
      val.className = 'ticker-val ' + (data.gold.changePercent >= 0 ? 'price-up' : 'price-down');
    }

    if (tickerUsd) {
      const val = tickerUsd.querySelector('.ticker-val');
      val.textContent = `₹${data.usdInr.rate.toFixed(2)}`;
    }

    // b. Update Dashboard Cards
    if (dashGold24k) dashGold24k.textContent = fmtINR(goldRate24kPerGram);
    if (dashGold22k) dashGold22k.textContent = fmtINR(goldRate22kPerGram);

    // Nifty Sentiment Meter rotation
    // RSI 0 is -90deg, RSI 100 is 90deg -> deg = (RSI - 50) * 1.8
    if (needle) {
      const deg = (data.nifty50.rsi - 50) * 1.8;
      needle.style.transform = `rotate(${deg}deg)`;
    }
    if (sentimentVal) {
      if (data.nifty50.rsi <= 35) {
        sentimentVal.textContent = "Oversold Opportunity";
        sentimentVal.style.color = "var(--accent-green)";
      } else if (data.nifty50.rsi >= 70) {
        sentimentVal.textContent = "Overbought Alert";
        sentimentVal.style.color = "var(--accent-red)";
      } else {
        sentimentVal.textContent = "Neutral Trend";
        sentimentVal.style.color = "var(--accent-gold)";
      }
    }
    if (sentimentRsi) sentimentRsi.textContent = data.nifty50.rsi;
    if (sentimentSma) {
      const diff = data.nifty50.price - data.nifty50.sma20;
      sentimentSma.textContent = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}`;
      sentimentSma.className = 'font-mono ' + (diff >= 0 ? 'price-up' : 'price-down');
    }
    if (sentimentRec) {
      sentimentRec.textContent = data.nifty50.sipRecommendation || data.nifty50.recommendation;
      // badge classes
      if (data.nifty50.percentile <= 30) {
        sentimentRec.className = 'badge font-mono price-up';
        sentimentRec.style.background = 'var(--accent-green-glow)';
      } else if (data.nifty50.percentile >= 70) {
        sentimentRec.className = 'badge font-mono price-down';
        sentimentRec.style.background = 'rgba(239, 68, 68, 0.1)';
      } else {
        sentimentRec.className = 'badge font-mono';
        sentimentRec.style.background = 'var(--accent-gold-glow)';
        sentimentRec.style.color = 'var(--accent-gold)';
      }
    }

    // c. Update Market Tab Deep Dive Metrics
    if (mNiftyPrice) mNiftyPrice.textContent = `₹${data.nifty50.price.toLocaleString('en-IN')}`;
    if (mNiftyChange) {
      mNiftyChange.textContent = `${data.nifty50.change >= 0 ? '▲ +' : '▼ '}${data.nifty50.change.toLocaleString('en-IN')} (${data.nifty50.changePercent}%)`;
      mNiftyChange.className = 'trend-indicator ' + (data.nifty50.change >= 0 ? 'price-up' : 'price-down');
    }

    if (mGoldPriceUsd) mGoldPriceUsd.textContent = fmtUSD(data.gold.priceUSD_oz);
    const mGoldPriceInr = document.getElementById('market-gold-price-inr');
    if (mGoldPriceInr) mGoldPriceInr.textContent = fmtINR(goldRate24kPerGram);
    if (mGoldChangeUsd) {
      mGoldChangeUsd.textContent = `${data.gold.changePercent >= 0 ? '▲ +' : '▼ '}${data.gold.changePercent}%`;
      mGoldChangeUsd.className = 'trend-indicator ' + (data.gold.changePercent >= 0 ? 'price-up' : 'price-down');
    }

    if (mUsdPrice) mUsdPrice.textContent = `₹${data.usdInr.rate.toFixed(2)}`;
    if (mUsdChange) {
      mUsdChange.textContent = isCached ? `Cached data` : `Live spot rate`;
      mUsdChange.className = isCached ? 'trend-indicator price-down' : 'trend-indicator price-up';
    }

    // Stock Advisory Sidebar Details
    if (advRsiVal) advRsiVal.textContent = data.nifty50.rsi;
    if (advSmaVal) {
      const diff = data.nifty50.price - data.nifty50.sma20;
      const pct = (diff / data.nifty50.sma20) * 100;
      advSmaVal.textContent = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)} (${pct.toFixed(2)}%)`;
      advSmaVal.className = 'adv-badge font-mono ' + (diff >= 0 ? 'price-up' : 'price-down');
    }
    const advRangeVal = document.getElementById('adv-range-val');
    if (advRangeVal && data.nifty50.monthlyMin) {
      advRangeVal.textContent = `₹${data.nifty50.monthlyMin.toLocaleString('en-IN')} - ₹${data.nifty50.monthlyMax.toLocaleString('en-IN')}`;
    }
    if (advStrategyVal) {
      advStrategyVal.textContent = data.nifty50.sipRecommendation || data.nifty50.recommendation;
      if (data.nifty50.percentile <= 30) {
        advStrategyVal.style.color = 'var(--accent-green)';
        advStrategyVal.style.borderColor = 'rgba(34, 197, 94, 0.2)';
        advStrategyVal.style.background = 'rgba(34, 197, 94, 0.05)';
      } else if (data.nifty50.percentile >= 70) {
        advStrategyVal.style.color = 'var(--accent-red)';
        advStrategyVal.style.borderColor = 'rgba(239, 68, 68, 0.2)';
        advStrategyVal.style.background = 'rgba(239, 68, 68, 0.05)';
      } else {
        advStrategyVal.style.color = 'var(--accent-gold)';
        advStrategyVal.style.borderColor = 'rgba(234, 179, 8, 0.2)';
        advStrategyVal.style.background = 'rgba(234, 179, 8, 0.05)';
      }
    }
    
    if (advisoryGauge) {
      advisoryGauge.style.left = `${data.nifty50.percentile || 50}%`;
    }
    if (advisoryGaugeStatus) {
      advisoryGaugeStatus.textContent = (data.nifty50.sipRecommendation || data.nifty50.recommendation).replace(/^[🟢🟡🔴]\s*/, '');
    }

    // Gold SIP Advisory Sidebar Details
    const goldAdvGauge = document.getElementById('gold-advisory-gauge');
    const goldAdvGaugeStatus = document.getElementById('gold-advisory-gauge-status');
    const goldAdvRangeVal = document.getElementById('gold-adv-range-val');
    const goldAdvPosVal = document.getElementById('gold-adv-pos-val');
    const goldAdvStrategyVal = document.getElementById('gold-adv-strategy-val');

    if (goldAdvGauge) {
      goldAdvGauge.style.left = `${data.gold.percentile || 50}%`;
    }
    if (goldAdvGaugeStatus) {
      goldAdvGaugeStatus.textContent = (data.gold.sipRecommendation || 'DCA Accumulate').replace(/^[🟢🟡🔴]\s*/, '');
    }
    if (goldAdvRangeVal && data.gold.monthlyMin) {
      goldAdvRangeVal.textContent = `${fmtINR(data.gold.monthlyMin)} - ${fmtINR(data.gold.monthlyMax)}`;
    }
    if (goldAdvPosVal) {
      goldAdvPosVal.textContent = `${data.gold.percentile || 50}% (Position in Range)`;
    }
    if (goldAdvStrategyVal) {
      goldAdvStrategyVal.textContent = data.gold.sipRecommendation || '🟡 Average Price (DCA Accumulate)';
      const goldPercent = data.gold.percentile || 50;
      if (goldPercent <= 30) {
        goldAdvStrategyVal.style.color = 'var(--accent-green)';
        goldAdvStrategyVal.style.borderColor = 'rgba(34, 197, 94, 0.2)';
        goldAdvStrategyVal.style.background = 'rgba(34, 197, 94, 0.05)';
      } else if (goldPercent >= 70) {
        goldAdvStrategyVal.style.color = 'var(--accent-red)';
        goldAdvStrategyVal.style.borderColor = 'rgba(239, 68, 68, 0.2)';
        goldAdvStrategyVal.style.background = 'rgba(239, 68, 68, 0.05)';
      } else {
        goldAdvStrategyVal.style.color = 'var(--accent-gold)';
        goldAdvStrategyVal.style.borderColor = 'rgba(234, 179, 8, 0.2)';
        goldAdvStrategyVal.style.background = 'rgba(234, 179, 8, 0.05)';
      }
    }

    // Set city label in gold card header
    const citySelectElement = document.getElementById('gold-city-select');
    const cityLabelElement = document.getElementById('gold-city-label');
    if (citySelectElement && cityLabelElement) {
      const cityName = citySelectElement.options[citySelectElement.selectedIndex].text;
      cityLabelElement.textContent = `🇮🇳 ${cityName} (24K 1g):`;
    }

    // d. Render SVG chart
    if (activeChartAsset === 'nifty') {
      if (data.nifty50.historical && data.nifty50.historical.length > 0) {
        drawMarketChart('nifty', data.nifty50.historical);
      }
    } else {
      if (data.gold.historical && data.gold.historical.length > 0) {
        drawMarketChart('gold', data.gold.historical);
      }
    }

    // Run gold calculations initially
    calculateGoldPrice();
    // Record current rate and render tracking panel
    trackAndRenderGold(goldRate24kPerGram);
    // Refresh portfolio calculation
    calculatePortfolio();
  }

  // 3. Draw Interactive SVG Sparkline Chart (Nifty or Gold)
  function drawMarketChart(type, prices) {
    const svg = document.getElementById('nifty-chart');
    if (!svg) return;

    // Generate dates sequence for 30 points
    const dates = [];
    const today = new Date();
    for (let i = prices.length - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dates.push(d.toLocaleDateString('en-CA')); // YYYY-MM-DD
    }

    // Set colors based on asset
    const accentColor = type === 'nifty' ? 'var(--accent-cyan)' : 'var(--accent-gold)';
    const gradientId = type === 'nifty' ? 'chart-gradient-nifty' : 'chart-gradient-gold';
    const stopColor = type === 'nifty' ? 'var(--accent-cyan)' : 'var(--accent-gold)';

    // Dimensions
    const width = 800;
    const height = 250;
    const paddingLeft = 60;
    const paddingRight = 30;
    const paddingTop = 30;
    const paddingBottom = 40;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    // Find bounds
    const minVal = Math.min(...prices) * 0.995;
    const maxVal = Math.max(...prices) * 1.005;
    const valRange = maxVal - minVal;

    // Points mapper
    const points = prices.map((price, index) => {
      const x = paddingLeft + (index / (prices.length - 1)) * chartWidth;
      const y = paddingTop + chartHeight - ((price - minVal) / valRange) * chartHeight;
      return { x, y, price, date: dates[index] };
    });

    // Path definitions
    const pathD = points.reduce((str, pt, idx) => {
      return str + `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)} `;
    }, '');

    const areaD = pathD + 
      `L ${points[points.length - 1].x.toFixed(1)} ${(paddingTop + chartHeight).toFixed(1)} ` +
      `L ${points[0].x.toFixed(1)} ${(paddingTop + chartHeight).toFixed(1)} Z`;

    // SVG content generation
    let svgContent = `
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${stopColor}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${stopColor}" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
    `;

    // Draw horizontal grid lines
    const gridLinesCount = 4;
    for (let i = 0; i <= gridLinesCount; i++) {
      const yVal = minVal + (i / gridLinesCount) * valRange;
      const yPos = paddingTop + chartHeight - (i / gridLinesCount) * chartHeight;
      
      svgContent += `
        <line class="chart-grid-line" x1="${paddingLeft}" y1="${yPos}" x2="${width - paddingRight}" y2="${yPos}" style="stroke: rgba(255,255,255,0.05); stroke-dasharray: 4;" />
        <text class="chart-text" x="${paddingLeft - 10}" y="${yPos + 4}" text-anchor="end" fill="var(--text-muted)" style="font-size: 0.65rem; font-family: var(--font-mono);">${Math.round(yVal).toLocaleString('en-IN')}</text>
      `;
    }

    // Draw axis lines
    svgContent += `
      <line class="chart-axis-line" x1="${paddingLeft}" y1="${paddingTop + chartHeight}" x2="${width - paddingRight}" y2="${paddingTop + chartHeight}" style="stroke: rgba(255,255,255,0.15);" />
      <line class="chart-axis-line" x1="${paddingLeft}" y1="${paddingTop}" x2="${paddingLeft}" y2="${paddingTop + chartHeight}" style="stroke: rgba(255,255,255,0.15);" />
    `;

    // Plot line paths
    svgContent += `
      <path class="chart-area" d="${areaD}" fill="url(#${gradientId})" />
      <path class="chart-line" d="${pathD}" fill="none" stroke="${accentColor}" stroke-width="2.5" />
    `;

    // Draw active data point markers
    points.forEach((pt, idx) => {
      const isLast = idx === points.length - 1;
      // Render key markers (start, mid, end)
      if (idx === 0 || idx === Math.floor(points.length / 2) || isLast) {
        svgContent += `
          <circle cx="${pt.x}" cy="${pt.y}" r="${isLast ? 5 : 3.5}" fill="${isLast ? accentColor : 'var(--bg-app)'}" stroke="${accentColor}" stroke-width="2" />
        `;
      }
      
      // X-Axis time indicators
      if (idx % 6 === 0 || isLast) {
        const dateFormatted = pt.date.substring(5); // MM-DD
        svgContent += `
          <text class="chart-text" x="${pt.x}" y="${paddingTop + chartHeight + 18}" text-anchor="middle" fill="var(--text-muted)" style="font-size: 0.65rem; font-family: var(--font-mono);">${dateFormatted}</text>
        `;
      }
    });

    svg.innerHTML = svgContent;

    // Attach interactive hover events
    const wrap = document.getElementById('nifty-svg-chart-wrap');
    const crosshair = document.getElementById('chart-crosshair');
    const tooltip = document.getElementById('chart-tooltip');

    if (wrap && crosshair && tooltip) {
      wrap.onmousemove = (e) => {
        const rect = svg.getBoundingClientRect();
        // Calculate relative coordinates in SVG viewBox system
        const scaleX = width / rect.width;
        const scaleY = height / rect.height;
        const relativeX = (e.clientX - rect.left) * scaleX;
        const relativeY = (e.clientY - rect.top) * scaleY;

        if (relativeX >= paddingLeft && relativeX <= (width - paddingRight)) {
          const mouseChartX = relativeX - paddingLeft;
          const idx = Math.round((mouseChartX / chartWidth) * (prices.length - 1));
          
          if (idx >= 0 && idx < prices.length) {
            const pt = points[idx];
            
            // Position crosshair (relative to container element rect width)
            const crosshairLeft = (pt.x / scaleX);
            crosshair.style.left = `${crosshairLeft}px`;
            crosshair.classList.remove('hidden');

            // Position tooltip
            const tooltipLeft = (pt.x / scaleX) + 15;
            const tooltipTop = (pt.y / scaleY) - 50;
            tooltip.style.left = `${tooltipLeft}px`;
            tooltip.style.top = `${tooltipTop}px`;
            tooltip.style.borderColor = accentColor;
            tooltip.classList.remove('hidden');

            tooltip.querySelector('.tooltip-date').textContent = pt.date;
            tooltip.querySelector('.tooltip-value').textContent = type === 'nifty'
              ? `₹${pt.price.toLocaleString('en-IN')}`
              : `₹${pt.price.toFixed(2)}/g`;
            tooltip.querySelector('.tooltip-value').style.color = accentColor;
          }
        } else {
          crosshair.classList.add('hidden');
          tooltip.classList.add('hidden');
        }
      };

      wrap.onmouseleave = () => {
        crosshair.classList.add('hidden');
        tooltip.classList.add('hidden');
      };
    }
  }

  // 4. Gold Tracker & Yearly Comparison Logic
  function trackAndRenderGold(currentPrice) {
    if (!currentPrice || currentPrice <= 0) return;

    const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    const currentMonthStr = todayStr.substring(0, 7); // YYYY-MM

    let trackerState = {
      current_month: {
        month: currentMonthStr,
        daily_prices: {}
      },
      monthly_averages: {}
    };

    const stored = localStorage.getItem('gold_tracker_state');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.current_month && parsed.monthly_averages) {
          trackerState = parsed;
        }
      } catch (e) {
        console.error("Error parsing gold tracker state:", e);
      }
    }

    // Rollover Check: if stored month is different, average its daily prices and clear
    if (trackerState.current_month.month !== currentMonthStr) {
      const prevMonth = trackerState.current_month.month;
      const dailyPrices = Object.values(trackerState.current_month.daily_prices || {});
      
      if (dailyPrices.length > 0) {
        const sum = dailyPrices.reduce((a, b) => a + b, 0);
        const avg = Math.round((sum / dailyPrices.length) * 100) / 100;
        trackerState.monthly_averages[prevMonth] = avg;
      }

      trackerState.current_month = {
        month: currentMonthStr,
        daily_prices: {}
      };
    }

    // Save today's price (1g 24K INR)
    trackerState.current_month.daily_prices[todayStr] = Math.round(currentPrice * 100) / 100;
    localStorage.setItem('gold_tracker_state', JSON.stringify(trackerState));

    // Lowest of Month Check: compare today against all previous days in the current month
    let isLowest = false;
    const dailyEntries = Object.entries(trackerState.current_month.daily_prices);
    if (dailyEntries.length > 1) {
      const otherPrices = dailyEntries
        .filter(([date]) => date !== todayStr)
        .map(([, p]) => p);
      
      if (otherPrices.length > 0) {
        const minOther = Math.min(...otherPrices);
        if (currentPrice < minOther) {
          isLowest = true;
        }
      }
    }

    // Alert badges
    const mLowBadge = document.getElementById('gold-monthly-low-badge');
    const buySignalBadge = document.getElementById('gold-tracker-buy-signal');

    if (isLowest) {
      if (mLowBadge) mLowBadge.classList.remove('hidden');
      if (buySignalBadge) buySignalBadge.classList.remove('hidden');
    } else {
      if (mLowBadge) mLowBadge.classList.add('hidden');
      if (buySignalBadge) buySignalBadge.classList.add('hidden');
    }

    // Render Daily Log
    const dailyTbody = document.getElementById('gold-daily-tbody');
    if (dailyTbody) {
      const sortedDaily = Object.entries(trackerState.current_month.daily_prices)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 31);

      if (sortedDaily.length > 0) {
        dailyTbody.innerHTML = sortedDaily.map(([date, p], idx) => {
          const isToday = date === todayStr;
          let statusText = isToday ? '<span class="badge" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6; border: none; padding: 2px 6px;">Today</span>' : '<span class="text-muted">Recorded</span>';
          if (isToday && isLowest) {
            statusText = '<span class="badge" style="background: var(--accent-green-glow); color: var(--accent-green); border: none; padding: 2px 6px;">Lowest 📉</span>';
          }

          let diffHtml = '';
          if (idx < sortedDaily.length - 1) {
            const prevP = sortedDaily[idx + 1][1];
            const diff = p - prevP;
            const diffPct = prevP ? (diff / prevP) * 100 : 0;
            const isUp = diff >= 0;
            const diffClass = isUp ? 'price-up' : 'price-down';
            const diffSign = isUp ? '▲ +' : '▼ ';
            diffHtml = `<span class="${diffClass}" style="font-size: 0.78rem; margin-left: 6px; font-weight: 500;">${diffSign}₹${Math.abs(diff).toFixed(2)} (${diffPct.toFixed(2)}%)</span>`;
          }

          return `
            <tr>
              <td class="font-mono">${date}</td>
              <td class="font-mono">₹${p.toFixed(2)}${diffHtml}</td>
              <td>${statusText}</td>
            </tr>
          `;
        }).join('');
      } else {
        dailyTbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted">No daily data recorded.</td></tr>`;
      }
    }

    // Render Yearly Compare
    const yearlyTbody = document.getElementById('gold-yearly-tbody');
    if (yearlyTbody) {
      const averagesList = Object.entries(trackerState.monthly_averages)
        .sort((a, b) => b[0].localeCompare(a[0]));

      if (averagesList.length > 0) {
        yearlyTbody.innerHTML = averagesList.map(([month, avg]) => {
          const diff = currentPrice - avg;
          const diffPct = (diff / avg) * 100;
          const isHigher = diff >= 0;
          const diffText = `${isHigher ? '+' : ''}${diffPct.toFixed(1)}%`;
          const diffClass = isHigher ? 'price-up' : 'price-down';

          return `
            <tr>
              <td class="font-mono">${month}</td>
              <td class="font-mono">₹${avg.toFixed(2)}</td>
              <td class="font-mono ${diffClass}">${diffText}</td>
            </tr>
          `;
        }).join('');
      } else {
        yearlyTbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted">No historical averages archived yet.</td></tr>`;
      }
    }
  }

  // 5. Gold rate weight calculator
  function calculateGoldPrice() {
    if (!calcWeight || !calcKarat || !calcMaking || !calcResultPrice) return;
    if (goldRate24kPerGram <= 0) return;

    const weight = parseFloat(calcWeight.value) || 0;
    const karat = parseFloat(calcKarat.value);
    const makingPct = parseFloat(calcMaking.value) || 0;

    // Adjust price per gram based on selected Karat purity
    // Use exact scraped Goodreturns rates for 22K if available
    let pricePerGram = goldRate24kPerGram;
    if (karat === 22) {
      pricePerGram = goldRate22kPerGram > 0 ? goldRate22kPerGram : goldRate24kPerGram * 0.916;
    } else if (karat === 18) {
      pricePerGram = goldRate24kPerGram * 0.75;
    }

    const rawGoldPrice = weight * pricePerGram;
    
    // Add making charges
    const makingPrice = rawGoldPrice * (makingPct / 100);
    const basePrice = rawGoldPrice + makingPrice;
    
    // Indian GST on gold purchase is standard 3%
    const gstPrice = basePrice * 0.03;
    const totalCost = basePrice + gstPrice;

    calcResultPrice.textContent = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(totalCost);
  }

  // Event Listeners for calculator inputs
  if (calcWeight && calcKarat && calcMaking) {
    calcWeight.addEventListener('input', calculateGoldPrice);
    calcKarat.addEventListener('change', calculateGoldPrice);
    calcMaking.addEventListener('input', calculateGoldPrice);
  }

  // Handle manual tab open redraws (SVGs need proper dimensions)
  window.addEventListener('market-tab-opened', () => {
    fetchMarketData();
  });

  // 6. Portfolio calculation and compounding growth projections
  const portAsset = document.getElementById('port-asset');
  const portType = document.getElementById('port-type');
  const portAmountLabel = document.getElementById('port-amount-label');
  const portAmount = document.getElementById('port-amount');
  const portQtyLabel = document.getElementById('port-qty-label');
  const portQty = document.getElementById('port-qty');
  const portCagr = document.getElementById('port-cagr');

  const portOutInvested = document.getElementById('port-out-invested');
  const portOutCurrent = document.getElementById('port-out-current');
  const portOutPnl = document.getElementById('port-out-pnl');

  const proj3y = document.getElementById('proj-3y');
  const proj5y = document.getElementById('proj-5y');
  const proj10y = document.getElementById('proj-10y');

  function calculatePortfolio() {
    if (!portAsset || !portType || !portAmount || !portQty || !portCagr) return;
    if (!lastFetchedData) return;

    const asset = portAsset.value;
    const type = portType.value;
    const amountVal = parseFloat(portAmount.value) || 0;
    const qtyVal = parseFloat(portQty.value) || 0;
    const cagr = parseFloat(portCagr.value) || 0;

    // Update labels dynamically based on type
    if (type === 'lumpsum') {
      if (portAmountLabel) portAmountLabel.textContent = "Average Buy Price (₹)";
      if (portQtyLabel) portQtyLabel.textContent = "Quantity (Units)";
    } else {
      if (portAmountLabel) portAmountLabel.textContent = "Monthly SIP Amount (₹)";
      if (portQtyLabel) portQtyLabel.textContent = "Duration (Months Paid)";
    }

    let currentLivePrice = 0;
    let historicalPrices = [];

    if (asset === 'nifty') {
      currentLivePrice = lastFetchedData.nifty50.price;
      historicalPrices = lastFetchedData.nifty50.historical || [];
    } else {
      currentLivePrice = goldRate24kPerGram;
      historicalPrices = lastFetchedData.gold.historical || [];
    }

    let invested = 0;
    let currentValuation = 0;

    if (type === 'lumpsum') {
      invested = amountVal * qtyVal;
      currentValuation = currentLivePrice * qtyVal;
    } else {
      invested = amountVal * qtyVal; // amountVal is monthly SIP, qtyVal is months paid
      
      // Calculate SIP P&L based on historical/average rates
      const avgPrice = historicalPrices.length > 0
        ? (historicalPrices.reduce((a, b) => a + b, 0) / historicalPrices.length)
        : currentLivePrice;

      const accumulatedUnits = invested / avgPrice;
      currentValuation = accumulatedUnits * currentLivePrice;
    }

    const pnl = currentValuation - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;

    const fmtINR = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);

    if (portOutInvested) portOutInvested.textContent = fmtINR(invested);
    if (portOutCurrent) portOutCurrent.textContent = fmtINR(currentValuation);
    
    if (portOutPnl) {
      const sign = pnl >= 0 ? '+' : '';
      portOutPnl.textContent = `${sign}${fmtINR(pnl)} (${sign}${pnlPct.toFixed(2)}%)`;
      portOutPnl.className = 'font-mono ' + (pnl >= 0 ? 'price-up' : 'price-down');
    }

    // Projections Future Value Projections
    const years = [3, 5, 10];
    const projections = {};

    years.forEach(y => {
      if (type === 'lumpsum') {
        projections[y] = currentValuation * Math.pow(1 + cagr / 100, y);
      } else {
        const r = cagr / 12 / 100;
        const n = y * 12;
        const fvCurrent = currentValuation * Math.pow(1 + r, n);
        let fvSip = 0;
        if (r > 0) {
          fvSip = amountVal * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
        } else {
          fvSip = amountVal * n;
        }
        projections[y] = fvCurrent + fvSip;
      }
    });

    if (proj3y) proj3y.textContent = fmtINR(projections[3]);
    if (proj5y) proj5y.textContent = fmtINR(projections[5]);
    if (proj10y) proj10y.textContent = fmtINR(projections[10]);
  }

  // 7. Custom Price Alerts and list management
  let activeAlerts = [];

  function loadAlerts() {
    const stored = localStorage.getItem('price_alerts');
    if (stored) {
      try {
        activeAlerts = JSON.parse(stored);
      } catch (e) {
        console.error("Error loading alerts:", e);
        activeAlerts = [];
      }
    } else {
      activeAlerts = [];
    }
  }

  function saveAlerts() {
    localStorage.setItem('price_alerts', JSON.stringify(activeAlerts));
  }

  function renderAlerts() {
    const alertsUl = document.getElementById('active-alerts-ul');
    if (!alertsUl) return;

    if (activeAlerts.length === 0) {
      alertsUl.innerHTML = `<li class="text-muted text-center" style="font-size: 0.78rem; padding: 10px; color: var(--text-muted);">No active price alerts set.</li>`;
      return;
    }

    alertsUl.innerHTML = activeAlerts.map(alert => {
      const assetName = alert.asset === 'nifty' ? 'Nifty 50' : 'Gold 24K';
      const condSign = alert.condition === 'above' ? '>' : '<';
      const priceFormatted = alert.asset === 'nifty'
        ? `₹${alert.price.toLocaleString('en-IN')}`
        : `₹${alert.price.toFixed(2)}/g`;

      return `
        <li class="alert-item" style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 6px; padding: 6px 10px; font-size: 0.75rem;">
          <div>
            <span style="color: ${alert.asset === 'nifty' ? 'var(--accent-cyan)' : 'var(--accent-gold)'}; font-weight: 600;">${assetName}</span>
            <span class="text-muted">${condSign}</span>
            <span style="font-weight: 600; color: var(--text-main);">${priceFormatted}</span>
          </div>
          <button class="delete-alert-btn text-btn" data-id="${alert.id}" style="color: var(--accent-red); cursor: pointer; padding: 2px 6px;">
            <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
          </button>
        </li>
      `;
    }).join('');

    alertsUl.querySelectorAll('.delete-alert-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        activeAlerts = activeAlerts.filter(a => a.id !== id);
        saveAlerts();
        renderAlerts();
      });
    });

    if (window.lucide) window.lucide.createIcons();
  }

  function playAlertSound() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const playBeep = (freq, duration, delay) => {
        setTimeout(() => {
          const osc = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();
          
          osc.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
          
          gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
          
          osc.start(audioCtx.currentTime);
          osc.stop(audioCtx.currentTime + duration);
        }, delay);
      };

      playBeep(880, 0.15, 0);
      playBeep(1046.5, 0.25, 180);
    } catch (e) {
      console.warn("AudioContext block or not supported:", e);
    }
  }

  function fireDesktopNotification(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body: body,
        icon: '/favicon.ico'
      });
    }
  }

  function checkPriceAlerts(data) {
    if (!data || activeAlerts.length === 0) return;

    const niftyPrice = data.nifty50.price;
    const goldPrice = goldRate24kPerGram;

    const remainingAlerts = [];
    let triggeredCount = 0;

    activeAlerts.forEach(alert => {
      const currentPrice = alert.asset === 'nifty' ? niftyPrice : goldPrice;
      let triggered = false;

      if (alert.condition === 'above' && currentPrice > alert.price) {
        triggered = true;
      } else if (alert.condition === 'below' && currentPrice < alert.price) {
        triggered = true;
      }

      if (triggered) {
        triggeredCount++;
        const assetName = alert.asset === 'nifty' ? 'Nifty 50' : 'Gold 24K';
        const condWord = alert.condition === 'above' ? 'crossed above' : 'dropped below';
        const targetFormatted = alert.asset === 'nifty'
          ? `₹${alert.price.toLocaleString('en-IN')}`
          : `₹${alert.price.toFixed(2)}`;
        const currentFormatted = alert.asset === 'nifty'
          ? `₹${currentPrice.toLocaleString('en-IN')}`
          : `₹${currentPrice.toFixed(2)}`;

        const title = `🚨 Price Alert Triggered!`;
        const body = `${assetName} has ${condWord} your target of ${targetFormatted} (Current: ${currentFormatted}).`;

        playAlertSound();
        fireDesktopNotification(title, body);

        if (window.showToast) {
          window.showToast(`${assetName} alert triggered: ${currentFormatted}!`, "warning");
        }
      } else {
        remainingAlerts.push(alert);
      }
    });

    if (triggeredCount > 0) {
      activeAlerts = remainingAlerts;
      saveAlerts();
      renderAlerts();
    }
  }

  // Helper to extract top 5 news titles from DOM
  const getTopHeadlines = () => {
    let titles = Array.from(document.querySelectorAll('.news-card-title'))
      .map(el => el.textContent.trim());
    if (titles.length === 0) {
      titles = Array.from(document.querySelectorAll('.brief-item > div:first-child'))
        .map(el => el.textContent.trim());
    }
    return titles.slice(0, 5);
  };

  // Helper function to resolve provider config for chat APIs
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

  let typingTimeoutId = null;
  function typeWriter(element, text, delay = 15) {
    if (typingTimeoutId) clearTimeout(typingTimeoutId);
    element.textContent = '';
    let i = 0;
    function type() {
      if (i < text.length) {
        element.textContent += text.charAt(i);
        i++;
        typingTimeoutId = setTimeout(type, delay);
      }
    }
    type();
  }

  // 8. Event Listeners for Portfolio Tracker Inputs
  if (portAsset) {
    portAsset.addEventListener('change', () => {
      if (portType.value === 'lumpsum') {
        if (portAsset.value === 'nifty') {
          portAmount.value = 22500;
          portQty.value = 10;
        } else {
          portAmount.value = 7000;
          portQty.value = 50;
        }
      }
      calculatePortfolio();
    });
  }

  if (portType) {
    portType.addEventListener('change', () => {
      if (portType.value === 'sip') {
        portAmount.value = 5000;
        portQty.value = 12;
      } else {
        if (portAsset.value === 'nifty') {
          portAmount.value = 22500;
          portQty.value = 10;
        } else {
          portAmount.value = 7000;
          portQty.value = 50;
        }
      }
      calculatePortfolio();
    });
  }

  if (portAmount) portAmount.addEventListener('input', calculatePortfolio);
  if (portQty) portQty.addEventListener('input', calculatePortfolio);
  if (portCagr) portCagr.addEventListener('input', calculatePortfolio);

  // 9. Interactive Chart Asset Toggles
  const chartBtnNifty = document.getElementById('chart-btn-nifty');
  const chartBtnGold = document.getElementById('chart-btn-gold');
  const chartMainTitle = document.getElementById('chart-main-title');
  const chartSubTitle = document.getElementById('chart-sub-title');

  if (chartBtnNifty && chartBtnGold) {
    chartBtnNifty.addEventListener('click', () => {
      activeChartAsset = 'nifty';
      chartBtnNifty.classList.add('active');
      chartBtnGold.classList.remove('active');
      if (chartMainTitle) chartMainTitle.textContent = "Nifty 50 Trend Sparkline";
      if (chartSubTitle) chartSubTitle.textContent = "Visualizing closing prices for index over the past 30 days.";
      if (lastFetchedData && lastFetchedData.nifty50.historical) {
        drawMarketChart('nifty', lastFetchedData.nifty50.historical);
      }
    });

    chartBtnGold.addEventListener('click', () => {
      activeChartAsset = 'gold';
      chartBtnGold.classList.add('active');
      chartBtnNifty.classList.remove('active');
      if (chartMainTitle) chartMainTitle.textContent = "Gold 24K Trend Sparkline";
      if (chartSubTitle) chartSubTitle.textContent = "Visualizing daily rates (per gram) in selected city over the past 30 days.";
      if (lastFetchedData && lastFetchedData.gold.historical) {
        drawMarketChart('gold', lastFetchedData.gold.historical);
      }
    });
  }

  // 10. AI Sentiment Analyst Listener
  const aiAuditBtn = document.getElementById('ai-market-audit-btn');
  const aiTerminalOutput = document.getElementById('ai-market-terminal-output');

  if (aiAuditBtn && aiTerminalOutput) {
    aiAuditBtn.addEventListener('click', async () => {
      if (!lastFetchedData) {
        aiTerminalOutput.textContent = "Error: Market telemetry data not loaded yet.";
        return;
      }

      const { activeProvider, activeKey, activeModel } = resolveAIConfig();

      if (!activeKey) {
        aiTerminalOutput.textContent = "Error: No API key configured. Please enter your Google or Nvidia API key in the Settings tab.";
        if (window.showToast) {
          window.showToast("API Key is missing! Set it in Settings.", "error");
        }
        return;
      }

      aiAuditBtn.disabled = true;
      aiAuditBtn.innerHTML = `<i data-lucide="loader" class="animate-spin" style="animation: spin 1s linear infinite; display: inline-block; margin-right: 6px;"></i> Auditing Market...`;
      if (window.lucide) window.lucide.createIcons();
      aiTerminalOutput.textContent = "Connecting to AI Analyst server...\nAnalyzing technical trends...\nSynthesizing news feeds...";

      const headlines = getTopHeadlines().map((h, i) => `${i + 1}. ${h}`).join('\n');
      const citySelect = document.getElementById('gold-city-select');
      const cityName = citySelect ? citySelect.options[citySelect.selectedIndex].text : 'Bengaluru';

      const prompt = `You are a financial macro analyst and advisor. Audit the current market indicators below and write a brief, high-level investment advice report.

Market Data:
- Nifty 50 Index: ₹${lastFetchedData.nifty50.price.toLocaleString('en-IN')} (Change: ${lastFetchedData.nifty50.changePercent}%, RSI: ${lastFetchedData.nifty50.rsi}, Rec: ${lastFetchedData.nifty50.sipRecommendation || lastFetchedData.nifty50.recommendation})
- Gold 24K Rate (${cityName}): ₹${goldRate24kPerGram.toFixed(2)}/g (Ounce USD: $${lastFetchedData.gold.priceUSD_oz})
- USD to INR Rate: ₹${usdInrRate.toFixed(2)}

Top News Headlines:
${headlines || 'No recent headlines available.'}

Instructions:
- Provide exactly 3 bullet points of macro investing advice.
- Be concise (maximum 15 words per bullet point).
- Make sure one bullet point discusses Stocks/Nifty, one discusses Gold/Hedging, and one discusses currency/USD-INR or macro trends.
- Use terminal green font friendly format. Do not use markdown headers or bold indicators.
- Output ONLY the 3 bullet points, using '-' as the bullet. No intro or outro.`;

      let currentModel = activeModel;
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
              model: currentModel,
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.3
            })
          });

          const respStatus = chatResponse.status;
          const respText = await chatResponse.text();

          const isRateLimitResponse = (status, text) => {
            return status === 429 || (text && text.toLowerCase().includes("rate limit"));
          };

          const getNextFailoverModel = (curr, google) => {
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
            const list = google ? GOOGLE_FAILOVER_LIST : NVIDIA_FAILOVER_LIST;
            const idx = list.indexOf(curr);
            if (idx !== -1 && idx < list.length - 1) {
              return list[idx + 1];
            }
            return list[0];
          };

          if (isRateLimitResponse(respStatus, respText)) {
            const isGoogle = activeProvider === 'google';
            currentModel = getNextFailoverModel(currentModel, isGoogle);
            console.warn(`Audit: Rate limit on model. Failover to ${currentModel}...`);
            if (window.showToast) {
              window.showToast(`Audit rate limit. Switching model...`, "warning");
            }
            retries++;
            continue;
          }

          if (!chatResponse.ok) {
            throw new Error(respText || 'AI Audit call failed');
          }

          const result = JSON.parse(respText);
          if (result.content) {
            const inputT = result.tokens?.input || 0;
            const outputT = result.tokens?.output || 0;
            settingsState.addUsage(activeProvider, currentModel, inputT, outputT);
            
            if (sessionStats && typeof sessionStats.incrementChat === 'function') {
              sessionStats.incrementChat();
            }

            typeWriter(aiTerminalOutput, result.content);
            success = true;
          } else {
            throw new Error("Received empty response content from backend.");
          }
        } catch (error) {
          console.error("AI Audit error:", error);
          finalError = error.message;
          retries++;
        }
      }

      if (!success) {
        aiTerminalOutput.textContent = `Error executing audit: ${finalError}\n\nPlease check your API key and connection, then try again.`;
      }

      aiAuditBtn.disabled = false;
      aiAuditBtn.innerHTML = `<i data-lucide="sparkles"></i> Run Financial Sentiment Audit`;
      if (window.lucide) window.lucide.createIcons();
    });
  }

  // 11. Custom Price Alerts Event Listeners & Setup
  const addAlertBtn = document.getElementById('add-alert-btn');
  if (addAlertBtn) {
    addAlertBtn.addEventListener('click', async () => {
      if ('Notification' in window) {
        await Notification.requestPermission();
      }

      const alertAsset = document.getElementById('alert-asset');
      const alertCondition = document.getElementById('alert-condition');
      const alertPrice = document.getElementById('alert-price');

      if (!alertAsset || !alertCondition || !alertPrice) return;

      const priceVal = parseFloat(alertPrice.value);
      if (isNaN(priceVal) || priceVal <= 0) {
        if (window.showToast) window.showToast("Please enter a valid price target.", "error");
        return;
      }

      const newAlert = {
        id: Date.now().toString(),
        asset: alertAsset.value,
        condition: alertCondition.value,
        price: priceVal,
        createdAt: new Date().toISOString()
      };

      activeAlerts.push(newAlert);
      saveAlerts();
      renderAlerts();

      if (window.showToast) {
        window.showToast(`Alert set for ${alertAsset.value === 'nifty' ? 'Nifty' : 'Gold'} at ₹${priceVal.toLocaleString('en-IN')}`, "success");
      }
    });
  }

  // 12. City Selector Dropdown Listener
  const goldCitySelect = document.getElementById('gold-city-select');
  if (goldCitySelect) {
    const savedCity = localStorage.getItem('selected_gold_city');
    if (savedCity) {
      goldCitySelect.value = savedCity;
    }
    goldCitySelect.addEventListener('change', () => {
      localStorage.setItem('selected_gold_city', goldCitySelect.value);
      fetchMarketData();
    });
  }

  // Load and render alerts on DOMContentLoaded
  loadAlerts();
  renderAlerts();

  // Load from local storage cache first for instant render on page load
  const cached = localStorage.getItem('cached_market_data');
  if (cached) {
    try {
      const cachedData = JSON.parse(cached);
      updateMarketUI(cachedData, true); // Mark as cached
    } catch (e) {
      console.error("Cache parse error during init:", e);
    }
  }

  // Initial fetch and set interval loop (fetch every 10 minutes)
  fetchMarketData();
  setInterval(fetchMarketData, 600000);
});
