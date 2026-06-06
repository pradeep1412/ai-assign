let goldRate24kPerGram = 0.0;
let goldRate22kPerGram = 0.0;
let usdInrRate = 83.50;

document.addEventListener('DOMContentLoaded', () => {
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
      const response = await fetch('/api/market');
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
      updateMarketUI(data);
    } catch (error) {
      console.error("Market fetch error, trying local cache:", error);
      const cached = localStorage.getItem('cached_market_data');
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
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

    // d. Render SVG chart sparkline
    if (data.nifty50.historical && data.nifty50.historical.length > 0) {
      drawNiftyChart(data.nifty50.historical);
    }

    // Run gold calculations initially
    calculateGoldPrice();
    // Record current rate and render tracking panel
    trackAndRenderGold(goldRate24kPerGram);
  }

  // 3. Draw Inline SVG Sparkline Chart
  function drawNiftyChart(prices) {
    const svg = document.getElementById('nifty-chart');
    if (!svg) return;

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
    const minVal = Math.min(...prices) * 0.998;
    const maxVal = Math.max(...prices) * 1.002;
    const valRange = maxVal - minVal;

    // Points mapper
    const points = prices.map((price, index) => {
      const x = paddingLeft + (index / (prices.length - 1)) * chartWidth;
      const y = paddingTop + chartHeight - ((price - minVal) / valRange) * chartHeight;
      return { x, y, price };
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
        <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent-cyan)" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="var(--accent-cyan)" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
    `;

    // Draw horizontal grid lines
    const gridLinesCount = 4;
    for (let i = 0; i <= gridLinesCount; i++) {
      const yVal = minVal + (i / gridLinesCount) * valRange;
      const yPos = paddingTop + chartHeight - (i / gridLinesCount) * chartHeight;
      
      svgContent += `
        <line class="chart-grid-line" x1="${paddingLeft}" y1="${yPos}" x2="${width - paddingRight}" y2="${yPos}" />
        <text class="chart-text" x="${paddingLeft - 10}" y="${yPos + 4}" text-anchor="end">${Math.round(yVal).toLocaleString('en-IN')}</text>
      `;
    }

    // Draw axis lines
    svgContent += `
      <line class="chart-axis-line" x1="${paddingLeft}" y1="${paddingTop + chartHeight}" x2="${width - paddingRight}" y2="${paddingTop + chartHeight}" />
      <line class="chart-axis-line" x1="${paddingLeft}" y1="${paddingTop}" x2="${paddingLeft}" y2="${paddingTop + chartHeight}" />
    `;

    // Plot line paths
    svgContent += `
      <path class="chart-area" d="${areaD}" />
      <path class="chart-line" d="${pathD}" />
    `;

    // Draw data points markers
    points.forEach((pt, idx) => {
      // Highlight last point
      const isLast = idx === points.length - 1;
      svgContent += `
        <circle cx="${pt.x}" cy="${pt.y}" r="${isLast ? 6 : 4}" fill="${isLast ? 'var(--accent-cyan)' : 'var(--bg-app)'}" stroke="var(--accent-cyan)" stroke-width="2" />
      `;
      
      // X-Axis time indicators (just days sequence)
      if (idx % 2 === 0 || isLast) {
        svgContent += `
          <text class="chart-text" x="${pt.x}" y="${paddingTop + chartHeight + 20}" text-anchor="middle">T-${prices.length - 1 - idx}d</text>
        `;
      }
    });

    svg.innerHTML = svgContent;
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
        dailyTbody.innerHTML = sortedDaily.map(([date, p]) => {
          const isToday = date === todayStr;
          let statusText = isToday ? '<span class="badge" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6; border: none; padding: 2px 6px;">Today</span>' : '<span class="text-muted">Recorded</span>';
          if (isToday && isLowest) {
            statusText = '<span class="badge" style="background: var(--accent-green-glow); color: var(--accent-green); border: none; padding: 2px 6px;">Lowest 📉</span>';
          }
          return `
            <tr>
              <td class="font-mono">${date}</td>
              <td class="font-mono">₹${p.toFixed(2)}</td>
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

  // Initial fetch and set interval loop (fetch every 3 minutes)
  fetchMarketData();
  setInterval(fetchMarketData, 180000);
});
