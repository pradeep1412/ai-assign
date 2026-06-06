import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  // Set CORS headers for local development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let nvidiaKey = null;
  try {
    const workspacePath = '/Users/pradeepkumarp/Documents/LearningMCP/nvidia.sh';
    if (fs.existsSync(workspacePath)) {
      const content = fs.readFileSync(workspacePath, 'utf8');
      const match = content.match(/Bearer\s+([a-zA-Z0-9_-]+)/);
      if (match) {
        nvidiaKey = match[1];
      }
    }
  } catch (error) {
    // Ignore reading error
  }

  return res.status(200).json({
    nvidia_key: nvidiaKey,
    environment: process.env.VERCEL ? 'production' : 'development'
  });
}
