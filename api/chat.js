export default async function handler(req, res) {
  // Set CORS headers for local development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const { provider, model, messages, temperature = 0.7 } = req.body || {};

  // Check for simulated rate limit trigger
  const hasTrigger429 = (messages || []).some(msg => 
    msg.content && msg.content.toLowerCase().includes('trigger 429')
  );

  if (hasTrigger429 && ['gemma-4-31b-it', 'nvidia/llama-3.1-nemotron-70b-instruct'].includes(model)) {
    return res.status(429).json({
      error: "Rate limit exceeded (Simulated 429)",
      status: 429,
      message: "Resource has been exhausted (Simulated rate limit error)"
    });
  }

  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(400).json({ error: "Missing API Key in headers (x-api-key)" });
  }

  const requestHeaders = {
    'Content-Type': 'application/json'
  };

  if (provider === 'nvidia') {
    const url = "https://integrate.api.nvidia.com/v1/chat/completions";
    requestHeaders['Authorization'] = `Bearer ${apiKey}`;

    const nvidiaPayload = {
      model,
      messages,
      temperature,
      max_tokens: 1024
    };

    try {
      const apiResponse = await fetch(url, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(nvidiaPayload),
        signal: AbortSignal.timeout(12000)
      });

      const status = apiResponse.status;
      const respHeaders = Object.fromEntries(apiResponse.headers.entries());
      const respBodyText = await apiResponse.text();

      let respJson = null;
      let content = "";
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        respJson = JSON.parse(respBodyText);
        content = respJson.choices?.[0]?.message?.content || "";
        inputTokens = respJson.usage?.prompt_tokens || 0;
        outputTokens = respJson.usage?.completion_tokens || 0;
      } catch (e) {
        if (status !== 200) {
          content = `Error from Nvidia API (${status}): ${respBodyText}`;
        } else {
          content = respBodyText;
        }
      }

      // Return raw request / response details to show on inspector
      return res.status(200).json({
        status,
        content,
        rawRequest: {
          url,
          method: "POST",
          headers: {
            ...requestHeaders,
            'Authorization': 'Bearer nvapi-********'
          },
          body: nvidiaPayload
        },
        rawResponse: {
          status,
          headers: respHeaders,
          body: respJson || respBodyText
        },
        tokens: {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens
        }
      });
    } catch (error) {
      return res.status(500).json({ error: `Failed to proxy chat to Nvidia NIM: ${error.message}` });
    }
  } else if (provider === 'google') {
    // Construct Gemini endpoint
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // Map OpenAI chat structure to Google Gemini content format
    const contents = messages.map(msg => {
      const role = msg.role === 'user' ? 'user' : 'model';
      return {
        role,
        parts: [{ text: msg.content || "" }]
      };
    });

    const geminiPayload = {
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: 2048
      }
    };

    try {
      const apiResponse = await fetch(url, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(geminiPayload),
        signal: AbortSignal.timeout(12000)
      });

      const status = apiResponse.status;
      const respHeaders = Object.fromEntries(apiResponse.headers.entries());
      const respBodyText = await apiResponse.text();

      let respJson = null;
      let content = "";
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        respJson = JSON.parse(respBodyText);
        content = respJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
        inputTokens = respJson.usageMetadata?.promptTokenCount || 0;
        outputTokens = respJson.usageMetadata?.candidatesTokenCount || 0;
      } catch (e) {
        if (status !== 200) {
          content = `Error from Gemini API (${status}): ${respBodyText}`;
        } else {
          content = respBodyText;
        }
      }

      // Return details
      return res.status(200).json({
        status,
        content,
        rawRequest: {
          url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=********`,
          method: "POST",
          headers: requestHeaders,
          body: geminiPayload
        },
        rawResponse: {
          status,
          headers: respHeaders,
          body: respJson || respBodyText
        },
        tokens: {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens
        }
      });
    } catch (error) {
      return res.status(500).json({ error: `Failed to proxy chat to Gemini: ${error.message}` });
    }
  } else {
    return res.status(400).json({ error: `Unsupported provider: ${provider}` });
  }
}
