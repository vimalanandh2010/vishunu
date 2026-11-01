/**
 * Load .env before any other module reads process.env.
 *
 * In Node.js ES modules, `import` statements are resolved and evaluated
 * before the importing file's own code runs. This means dotenv.config()
 * placed in server.js body fires AFTER every imported module has already
 * read process.env at their module-level scope.
 *
 * Solution: put dotenv.config() in its own module and import it FIRST in
 * server.js so the env is populated before authMiddleware (or any other
 * module) reads process.env.JWT_SECRET at the top level.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({
  path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'),
  override: true,
});
