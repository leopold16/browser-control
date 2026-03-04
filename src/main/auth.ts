import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { Request, Response, NextFunction } from 'express';

interface Config {
  apiKey: string;
}

let config: Config | null = null;

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadOrCreateConfig(): Config {
  if (config) return config;

  const configPath = getConfigPath();
  try {
    const data = fs.readFileSync(configPath, 'utf-8');
    config = JSON.parse(data) as Config;
    return config;
  } catch {
    // Generate new key
    config = {
      apiKey: crypto.randomBytes(32).toString('hex'),
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return config;
  }
}

export function getApiKey(): string {
  return loadOrCreateConfig().apiKey;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ ok: false, error: 'Missing Authorization: Bearer <key> header' });
    return;
  }

  const token = authHeader.slice(7);
  if (token !== getApiKey()) {
    res.status(403).json({ ok: false, error: 'Invalid API key' });
    return;
  }

  next();
}
