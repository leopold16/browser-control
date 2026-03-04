import express from 'express';
import { authMiddleware } from './auth';
import apiRoutes from './api-routes';

let server: ReturnType<typeof express.application.listen> | null = null;

export function startApiServer(): void {
  const app = express();

  app.use(express.json());
  app.use(authMiddleware);
  app.use('/', apiRoutes);

  server = app.listen(3000, '127.0.0.1', () => {
    console.log('API server running on http://127.0.0.1:3000');
  });
}

export function stopApiServer(): void {
  if (server) {
    server.close();
    server = null;
  }
}
