export default async function handler(req, res) {
  // Set CORS headers for local development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const newsItems = [];
  const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  try {
    const response = await fetch('https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en', {
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(6000)
    });

    if (response.ok) {
      const xmlText = await response.text();
      
      // Zero-dependency XML parsing using Regex
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      
      while ((match = itemRegex.exec(xmlText)) !== null && newsItems.length < 15) {
        const itemContent = match[1];
        
        // Extract tags
        let title = itemContent.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '';
        let link = itemContent.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '#';
        let pubDate = itemContent.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '';
        let source = itemContent.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || 'Google News';

        // Clean CDATA wrappers if any
        title = title.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
        link = link.trim().replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
        pubDate = pubDate.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
        source = source.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');

        // Clean trailing Google News source suffix (e.g. "Headline - Reuters")
        const cleanTitle = title.replace(/\s+-\s+[^ -]+$/, '');

        newsItems.push({
          title: cleanTitle,
          link: link,
          pubDate: pubDate,
          source: source
        });
      }
    }
  } catch (error) {
    // Return fallback items in case Google News RSS is blocked or slow
    return res.status(200).json({
      news: [
        { title: "Global Markets Rally Amid Favorable Economic Policy Reports", link: "#", pubDate: "Sat, 06 Jun 2026 10:00:00 GMT", source: "Finance Brief" },
        { title: "Gold Prices Steady as USD and Rupee Consolidate", link: "#", pubDate: "Sat, 06 Jun 2026 09:30:00 GMT", source: "Gold Tracker" },
        { title: "Nifty 50 Outlook: Experts Advise Dollar-Cost Averaging for Long Term", link: "#", pubDate: "Sat, 06 Jun 2026 08:45:00 GMT", source: "Market Watch" }
      ]
    });
  }

  return res.status(200).json({ news: newsItems });
}
