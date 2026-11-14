// Imported first by index.js: fixes the working directory to backend/ before any module
// resolves relative paths (uploads/, fonts/). cPanel/Passenger may start the app from another folder.
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
dotenv.config({ path: path.join(root, '.env') });
process.env.TZ = 'Asia/Dhaka';
