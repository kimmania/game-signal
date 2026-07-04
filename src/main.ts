import './style.css';
import { bootstrap } from './app.ts';

bootstrap().catch(() => {
  // Unhandled bootstrap errors intentionally silent in production.
});
