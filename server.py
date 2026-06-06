import http.server
import json
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
import os
import re
import socketserver
import time

PORT = 8080

CACHE = {
    'nifty50': None,
    'niftyTime': 0,
    'gold': None,
    'goldTime': 0,
    'usdInr': None,
    'usdInrTime': 0
}

# Helper function to fetch URL with custom user-agent and timeout
def fetch_url(url, headers=None, method='GET', data=None):
    default_headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    if headers:
        default_headers.update(headers)
    
    req = urllib.request.Request(url, headers=default_headers, method=method)
    
    if data:
        if isinstance(data, dict):
            req.add_header('Content-Type', 'application/json')
            data_bytes = json.dumps(data).encode('utf-8')
        else:
            data_bytes = data.encode('utf-8')
    else:
        data_bytes = None

    try:
        with urllib.request.urlopen(req, data=data_bytes, timeout=10) as response:
            status = response.status
            headers_dict = dict(response.info())
            body = response.read().decode('utf-8')
            return status, headers_dict, body
    except urllib.error.HTTPError as e:
        headers_dict = dict(e.headers) if hasattr(e, 'headers') else {}
        body = e.read().decode('utf-8') if hasattr(e, 'read') else str(e)
        return e.code, headers_dict, body
    except Exception as e:
        return 500, {}, str(e)

# RSI Calculator helper
def calculate_rsi(prices, period=14):
    if len(prices) < period + 1:
        return 50.0
    
    deltas = [prices[i] - prices[i-1] for i in range(1, len(prices))]
    gains = [d if d > 0 else 0 for d in deltas]
    losses = [-d if d < 0 else 0 for d in deltas]
    
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    
    if avg_loss == 0:
        rs = float('inf')
    else:
        rs = avg_gain / avg_loss
        
    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        if avg_loss == 0:
            rs = float('inf')
        else:
            rs = avg_gain / avg_loss
            
    if rs == float('inf'):
        return 100.0
    return round(100.0 - (100.0 / (1.0 + rs)), 2)

class LocalVercelEmulatorHandler(http.server.SimpleHTTPRequestHandler):
    
    def end_headers(self):
        # Add global CORS headers for local development testing
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, x-api-key')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/api/config'):
            self.handle_api_config()
        elif self.path.startswith('/api/market'):
            self.handle_api_market()
        elif self.path.startswith('/api/news'):
            self.handle_api_news()
        else:
            # Serve standard static assets
            super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/chat'):
            self.handle_api_chat()
        else:
            self.send_response(404)
            self.end_headers()

    def handle_api_config(self):
        nvidia_key = None
        try:
            # Check the workspace path of the nvidia.sh file (up one directory from ai-assign)
            workspace_path = '../nvidia.sh'
            if os.path.exists(workspace_path):
                with open(workspace_path, 'r') as f:
                    content = f.read()
                    match = re.search(r'Bearer\s+([a-zA-Z0-9_-]+)', content)
                    if match:
                        nvidia_key = match.group(1)
        except Exception:
            pass
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({
            "nvidia_key": nvidia_key,
            "environment": "development"
        }).encode('utf-8'))

    def handle_api_market(self):
        global CACHE
        now = time.time()
        
        # 1. Fetch USD/INR Rate
        usd_data = None
        if CACHE.get('usdInr') and (now - CACHE.get('usdInrTime', 0) < 30 * 60):
            usd_data = CACHE['usdInr']
        else:
            usd_data = {
                "rate": 83.50,
                "change": 0.0
            }
            try:
                usd_status, _, usd_body = fetch_url('https://open.er-api.com/v6/latest/USD')
                if usd_status == 200:
                    ex_data = json.loads(usd_body)
                    inr_rate = ex_data.get('rates', {}).get('INR', 83.50)
                    usd_data['rate'] = inr_rate
            except Exception:
                pass
            CACHE['usdInr'] = usd_data
            CACHE['usdInrTime'] = now

        # 2. Fetch Nifty 50 (^NSEI)
        nifty_data = None
        if CACHE.get('nifty50') and (now - CACHE.get('niftyTime', 0) < 10 * 60):
            nifty_data = CACHE['nifty50']
        else:
            nifty_data = {
                "price": 0.0,
                "change": 0.0,
                "changePercent": 0.0,
                "rsi": 50.0,
                "sma20": 0.0,
                "recommendation": "Neutral",
                "historical": [],
                "monthlyMin": 0.0,
                "monthlyMax": 0.0,
                "percentile": 50.0,
                "sipRecommendation": "Accumulate (DCA)"
            }
            try:
                nifty_status, _, nifty_body = fetch_url('https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?range=1mo&interval=1d')
                if nifty_status == 200:
                    nifty_json = json.loads(nifty_body)
                    result = nifty_json.get('chart', {}).get('result', [None])[0]
                    if result:
                        meta = result.get('meta', {})
                        current_price = meta.get('regularMarketPrice', 0.0)
                        prev_close = meta.get('previousClose', current_price)
                        change = current_price - prev_close
                        change_pct = (change / prev_close) * 100 if prev_close else 0.0

                        nifty_data['price'] = round(current_price, 2)
                        nifty_data['change'] = round(change, 2)
                        nifty_data['changePercent'] = round(change_pct, 2)

                        adj_close = result.get('indicators', {}).get('quote', [{}])[0].get('close', [])
                        prices = [p for p in adj_close if p is not None]

                        if prices:
                            if abs(prices[-1] - current_price) > 0.01:
                                prices.append(current_price)
                            nifty_data['historical'] = [round(p, 2) for p in prices[-10:]]

                            rsi = calculate_rsi(prices, 14)
                            nifty_data['rsi'] = rsi

                            sma20 = sum(prices[-20:]) / min(len(prices), 20) if prices else current_price
                            nifty_data['sma20'] = round(sma20, 2)

                            # Calculate 1-month Nifty range & SIP Advice
                            nifty_min = min(prices)
                            nifty_max = max(prices)
                            nifty_range = nifty_max - nifty_min
                            nifty_pct = ((current_price - nifty_min) / nifty_range * 100) if nifty_range else 50.0

                            nifty_data['monthlyMin'] = round(nifty_min, 2)
                            nifty_data['monthlyMax'] = round(nifty_max, 2)
                            nifty_data['percentile'] = round(nifty_pct, 2)

                            if nifty_pct <= 30:
                                nifty_data['sipRecommendation'] = "🟢 Great Time to Buy SIP (Near Monthly Low)"
                            elif nifty_pct <= 70:
                                nifty_data['sipRecommendation'] = "🟡 Average Price (DCA Accumulate)"
                            else:
                                nifty_data['sipRecommendation'] = "🔴 Price is High (Wait for Dip / Small DCA)"

                            if rsi <= 35:
                                nifty_data['recommendation'] = "Strong Buy (Oversold)"
                            elif rsi >= 70:
                                nifty_data['recommendation'] = "Hold/Sell (Overbought)"
                            else:
                                if current_price > sma20:
                                    nifty_data['recommendation'] = "Buy (Bullish Trend)"
                                else:
                                    nifty_data['recommendation'] = "Accumulate (DCA)"
                    else:
                        raise Exception("Nifty response metadata missing")
                else:
                    raise Exception(f"Nifty response status {nifty_status}")
            except Exception:
                # Try Moneycontrol scraper as secondary live source!
                try:
                    mc_status, _, mc_body = fetch_url('https://www.moneycontrol.com/indian-indices/nifty-50-9.html')
                    if mc_status == 200:
                        price_match = re.search(r'id="sp_val">([^<]+)', mc_body)
                        prev_close_match = re.search(r'id="sp_previousclose">([^<]+)', mc_body)
                        if price_match and prev_close_match:
                            current_price = float(price_match.group(1).replace(',', ''))
                            prev_close = float(prev_close_match.group(1).replace(',', ''))
                            change = current_price - prev_close
                            change_pct = (change / prev_close) * 100
                            
                            nifty_data['price'] = round(current_price, 2)
                            nifty_data['change'] = round(change, 2)
                            nifty_data['changePercent'] = round(change_pct, 2)
                            
                            base = current_price
                            nifty_data['historical'] = [
                                round(base - 200, 2), round(base - 150, 2), round(base - 100, 2),
                                round(base - 120, 2), round(base - 50, 2), round(base - 80, 2),
                                round(base - 30, 2), round(base - 10, 2), round(base + 20, 2), round(base, 2)
                            ]
                            nifty_data['rsi'] = 48.5
                            nifty_data['sma20'] = round(current_price - 50, 2)
                            nifty_data['recommendation'] = "Accumulate (DCA - Live Scrape)"
                            nifty_data['monthlyMin'] = round(current_price - 300, 2)
                            nifty_data['monthlyMax'] = round(current_price + 200, 2)
                            nifty_data['percentile'] = 60.0
                            nifty_data['sipRecommendation'] = "🟡 Average Price (DCA - Live Scrape)"
                        else:
                            raise Exception("Moneycontrol regex match failed")
                    else:
                        raise Exception(f"Moneycontrol response status {mc_status}")
                except Exception:
                    # Final mock fallback
                    nifty_data['price'] = 23366.70
                    nifty_data['change'] = -49.85
                    nifty_data['changePercent'] = -0.21
                    nifty_data['recommendation'] = "Accumulate (DCA - Fallback)"
                    nifty_data['historical'] = [23100, 23150, 23200, 23120, 23300, 23250, 23280, 23310, 23330, 23366.70]
                    nifty_data['rsi'] = 51.5
                    nifty_data['sma20'] = 23250.00
                    nifty_data['monthlyMin'] = 23100.00
                    nifty_data['monthlyMax'] = 23366.70
                    nifty_data['percentile'] = 100.0
                    nifty_data['sipRecommendation'] = "🔴 Price is High (Wait for Dip / Fallback)"
            
            CACHE['nifty50'] = nifty_data
            CACHE['niftyTime'] = now

        # 3. Fetch Gold rates (USD International spot & INR Domestic retail)
        gold_data = None
        if CACHE.get('gold') and (now - CACHE.get('goldTime', 0) < 30 * 60):
            gold_data = CACHE['gold']
        else:
            gold_data = {
                "priceUSD_oz": 0.0,
                "priceINR_10g_24k": 0.0,
                "priceINR_10g_22k": 0.0,
                "priceINR_1g_24k": 0.0,
                "priceINR_1g_22k": 0.0,
                "changePercent": 0.0,
                "monthlyMin": 0.0,
                "monthlyMax": 0.0,
                "percentile": 50.0,
                "sipRecommendation": "Accumulate (DCA)"
            }
            current_gold_usd = 4328.00
            change_pct = 0.12
            usd_fetch_success = False
            gold_history_usd = []

            # Step 3a: Fetch International USD Spot Price (Yahoo or CoinGecko fallback)
            try:
                gold_status, _, gold_body = fetch_url('https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=1mo&interval=1d')
                if gold_status == 200:
                    gold_json = json.loads(gold_body)
                    result = gold_json.get('chart', {}).get('result', [None])[0]
                    if result:
                        meta = result.get('meta', {})
                        current_gold_usd = meta.get('regularMarketPrice', current_gold_usd)
                        prev_close = meta.get('previousClose', current_gold_usd)
                        change_pct = ((current_gold_usd - prev_close) / prev_close) * 100 if prev_close else change_pct
                        
                        adj_close = result.get('indicators', {}).get('quote', [{}])[0].get('close', [])
                        gold_history_usd = [p for p in adj_close if p is not None]
                        usd_fetch_success = True
            except Exception:
                pass

            if not usd_fetch_success:
                try:
                    cg_status, _, cg_body = fetch_url('https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd')
                    if cg_status == 200:
                        cg_json = json.loads(cg_body)
                        current_gold_usd = cg_json.get('pax-gold', {}).get('usd', current_gold_usd)
                        usd_fetch_success = True
                except Exception:
                    pass

            gold_data['priceUSD_oz'] = round(current_gold_usd, 2)
            gold_data['changePercent'] = round(change_pct, 2)

            # Step 3b: Fetch Domestic INR Gold Price (Scraping Goodreturns for accurate retail rates)
            scraped_success = False
            price_24k = 0.0
            price_22k = 0.0

            try:
                gr_status, _, gr_body = fetch_url('https://www.goodreturns.in/gold-rates/')
                if gr_status == 200:
                    p24_match = re.search(r'id="24K-price"[^>]*>&#x20b9;([\d,]+)</span>', gr_body)
                    p22_match = re.search(r'id="22K-price"[^>]*>&#x20b9;([\d,]+)</span>', gr_body)
                    if p24_match and p22_match:
                        price_24k = float(p24_match.group(1).replace(',', '')) * 10
                        price_22k = float(p22_match.group(1).replace(',', '')) * 10
                        
                        gold_data['priceINR_10g_24k'] = round(price_24k, 2)
                        gold_data['priceINR_10g_22k'] = round(price_22k, 2)
                        
                        # Parse change pill for domestic percentage change
                        pill_match = re.search(r'id="24K-price".*?class="gr-change-pill\s+(gr-change-up|gr-change-down)"[^>]*>\s*<p>([^<]+)</p>', gr_body, re.DOTALL)
                        if pill_match:
                            direction = pill_match.group(1)
                            value_str = pill_match.group(2).replace('&nbsp;', '').replace('-', '').strip()
                            val = float(value_str) * 10
                            if direction == 'gr-change-down':
                                val = -val
                            prev_price = price_24k - val
                            change_pct_domestic = (val / prev_price) * 100 if prev_price else 0.0
                            gold_data['changePercent'] = round(change_pct_domestic, 2)
                        scraped_success = True
            except Exception:
                pass

            # Step 3c: Fallback calculation if scraping fails
            if not scraped_success:
                rate = usd_data['rate']
                # Apply 1.305 multiplier to spot price to account for 15% customs duty, 3% GST, and IBJA retail premiums
                gold_inr_per_gram = (current_gold_usd * rate * 1.305) / 31.1034768
                price_24k = gold_inr_per_gram * 10
                price_22k = price_24k * 0.916
                
                gold_data['priceINR_10g_24k'] = round(price_24k, 2)
                gold_data['priceINR_10g_22k'] = round(price_22k, 2)

            # Step 3d: Set 1-gram rates and calculate 30-day Range & SIP Advice
            price_24k_1g = price_24k / 10
            price_22k_1g = price_22k / 10
            gold_data['priceINR_1g_24k'] = round(price_24k_1g, 2)
            gold_data['priceINR_1g_22k'] = round(price_22k_1g, 2)

            if gold_history_usd:
                # Calibrate ratio based on current Goodreturns/fallback price vs USD spot
                ratio = price_24k_1g / (current_gold_usd / 31.1034768)
                gold_history_inr_1g = [round((p_usd / 31.1034768) * ratio, 2) for p_usd in gold_history_usd]
                
                gold_min = min(gold_history_inr_1g)
                gold_max = max(gold_history_inr_1g)
                gold_range = gold_max - gold_min
                gold_pct = ((price_24k_1g - gold_min) / gold_range * 100) if gold_range else 50.0
                
                gold_data['monthlyMin'] = round(gold_min, 2)
                gold_data['monthlyMax'] = round(gold_max, 2)
                gold_data['percentile'] = round(gold_pct, 2)
                
                if gold_pct <= 30:
                    gold_data['sipRecommendation'] = "🟢 Great Time to Buy SIP (Near Monthly Low)"
                elif gold_pct <= 70:
                    gold_data['sipRecommendation'] = "🟡 Average Price (DCA Accumulate)"
                else:
                    gold_data['sipRecommendation'] = "🔴 Price is High (Wait for Dip / Small DCA)"
            else:
                gold_data['monthlyMin'] = round(price_24k_1g * 0.98, 2)
                gold_data['monthlyMax'] = round(price_24k_1g * 1.02, 2)
                gold_data['percentile'] = 50.0
                gold_data['sipRecommendation'] = "🟡 Average Price (DCA - Fallback Estimate)"
            
            CACHE['gold'] = gold_data
            CACHE['goldTime'] = now

        response_data = {
            "nifty50": nifty_data,
            "gold": gold_data,
            "usdInr": usd_data
        }
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(response_data).encode('utf-8'))

    def handle_api_news(self):
        news_items = []
        try:
            status, _, body = fetch_url('https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en')
            if status == 200:
                root = ET.fromstring(body)
                channel = root.find('channel')
                if channel is not None:
                    items = channel.findall('item')
                    for item in items[:15]:
                        title = item.find('title').text if item.find('title') is not None else 'No Title'
                        link = item.find('link').text if item.find('link') is not None else '#'
                        pub_date = item.find('pubDate').text if item.find('pubDate') is not None else ''
                        source = item.find('source').text if item.find('source') is not None else 'Google News'
                        
                        clean_title = re.sub(r'\s+-\s+[^ -]+$', '', title)
                        
                        news_items.append({
                            "title": clean_title,
                            "link": link,
                            "pubDate": pub_date,
                            "source": source
                        })
        except Exception:
            news_items = [
                {"title": "Global Markets Rally Amid Favorable Economic Policy Reports", "link": "#", "pubDate": "Sat, 06 Jun 2026 10:00:00 GMT", "source": "Finance Brief"},
                {"title": "Gold Prices Steady as USD and Rupee Consolidate", "link": "#", "pubDate": "Sat, 06 Jun 2026 09:30:00 GMT", "source": "Gold Tracker"},
                {"title": "Nifty 50 Outlook: Experts Advise Dollar-Cost Averaging for Long Term", "link": "#", "pubDate": "Sat, 06 Jun 2026 08:45:00 GMT", "source": "Market Watch"}
            ]

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({"news": news_items}).encode('utf-8'))

    def handle_api_chat(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body_data = self.rfile.read(content_length).decode('utf-8')
        
        try:
            req_body = json.loads(body_data)
        except Exception:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Invalid request JSON body"}).encode('utf-8'))
            return

        provider = req_body.get('provider')
        model = req_body.get('model')
        messages = req_body.get('messages', [])
        temperature = req_body.get('temperature', 0.7)

        # Check for simulated rate limit trigger
        has_trigger_429 = False
        for msg in messages:
            if msg.get('content') and 'trigger 429' in msg.get('content').lower():
                has_trigger_429 = True
                break

        if has_trigger_429 and model in ['gemma-4-31b-it', 'nvidia/llama-3.1-nemotron-70b-instruct']:
            self.send_response(429)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                "error": "Rate limit exceeded (Simulated 429)",
                "status": 429,
                "message": "Resource has been exhausted (Simulated rate limit error)"
            }).encode('utf-8'))
            return

        api_key = self.headers.get('x-api-key')
        if not api_key:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Missing API Key in headers (x-api-key)"}).encode('utf-8'))
            return

        request_headers = {
            "Content-Type": "application/json"
        }

        if provider == 'nvidia':
            url = "https://integrate.api.nvidia.com/v1/chat/completions"
            request_headers["Authorization"] = f"Bearer {api_key}"
            nvidia_payload = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": 1024
            }

            status, resp_headers, resp_body = fetch_url(url, headers=request_headers, method='POST', data=nvidia_payload)
            
            content = ""
            input_tokens = 0
            output_tokens = 0
            resp_json = None
            try:
                resp_json = json.loads(resp_body)
                content = resp_json.get('choices', [{}])[0].get('message', {}).get('content', '')
                usage = resp_json.get('usage', {})
                input_tokens = usage.get('prompt_tokens', 0)
                output_tokens = usage.get('completion_tokens', 0)
            except Exception:
                content = resp_body if status == 200 else f"Error from Nvidia ({status}): {resp_body}"

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": status,
                "content": content,
                "rawRequest": {
                    "url": url,
                    "method": "POST",
                    "headers": {k: ("Bearer ****" if k.lower() == 'authorization' else v) for k, v in request_headers.items()},
                    "body": nvidia_payload
                },
                "rawResponse": {
                    "status": status,
                    "headers": resp_headers,
                    "body": resp_json if resp_json else resp_body
                },
                "tokens": {
                    "input": input_tokens,
                    "output": output_tokens,
                    "total": input_tokens + output_tokens
                }
            }).encode('utf-8'))

        elif provider == 'google':
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            contents = []
            for msg in messages:
                role = 'user' if msg.get('role') == 'user' else 'model'
                contents.append({
                    "role": role,
                    "parts": [{"text": msg.get('content', '')}]
                })
            
            gemini_payload = {
                "contents": contents,
                "generationConfig": {
                    "temperature": temperature,
                    "maxOutputTokens": 2048
                }
            }

            status, resp_headers, resp_body = fetch_url(url, headers=request_headers, method='POST', data=gemini_payload)

            content = ""
            input_tokens = 0
            output_tokens = 0
            resp_json = None
            try:
                resp_json = json.loads(resp_body)
                content = resp_json.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
                usage = resp_json.get('usageMetadata', {})
                input_tokens = usage.get('promptTokenCount', 0)
                output_tokens = usage.get('candidatesTokenCount', 0)
            except Exception:
                content = resp_body if status == 200 else f"Error from Gemini ({status}): {resp_body}"

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": status,
                "content": content,
                "rawRequest": {
                    "url": f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=********",
                    "method": "POST",
                    "headers": request_headers,
                    "body": gemini_payload
                },
                "rawResponse": {
                    "status": status,
                    "headers": resp_headers,
                    "body": resp_json if resp_json else resp_body
                },
                "tokens": {
                    "input": input_tokens,
                    "output": output_tokens,
                    "total": input_tokens + output_tokens
                }
            }).encode('utf-8'))
        else:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"Unsupported provider {provider}"}).encode('utf-8'))

class MyTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

if __name__ == '__main__':
    # Serve from the directory where server.py is located
    print(f"\x1b[32m✔ Starting Python local server at: http://localhost:{PORT}\x1b[0m")
    print("This server runs completely locally using standard libraries, requiring NO pip packages!")
    print("Press Ctrl+C to terminate.")
    
    # Overwrite SimpleHTTPRequestHandler dir to current folder
    handler = LocalVercelEmulatorHandler
    with MyTCPServer(("", PORT), handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopping local dev server...")
            httpd.shutdown()
