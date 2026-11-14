import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 8,
  maxIdle: 4,
  idleTimeout: 60000,
  connectTimeout: 20000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  charset: 'utf8mb4',
  dateStrings: true,
});

const RETRY_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ECONNREFUSED', 'EPIPE']);

// All NOW()/CURDATE() values are Bangladesh time
pool.on('connection', conn => conn.query("SET time_zone = '+06:00'"));

export async function q(sql, params = [], attempt = 0) {
  try {
    const [rows] = await pool.query(sql, params);
    return rows;
  } catch (e) {
    if (attempt < 2 && RETRY_CODES.has(e.code)) {
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      return q(sql, params, attempt + 1);
    }
    throw e;
  }
}
export const one = async (sql, p) => (await q(sql, p))[0] || null;

// Tables use new names so the empty tables from the earlier prototype are left untouched.
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120), email VARCHAR(190) UNIQUE,
    password VARCHAR(255), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS app_settings (k VARCHAR(100) PRIMARY KEY, v JSON, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS secrets (k VARCHAR(100) PRIMARY KEY, v TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS wp_seen (
    wp_id BIGINT PRIMARY KEY, title TEXT, link VARCHAR(600), image VARCHAR(600), category VARCHAR(190),
    published_at DATETIME, seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, processed TINYINT DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS card_templates (
    id INT AUTO_INCREMENT PRIMARY KEY, kind VARCHAR(20), name VARCHAR(150), settings JSON,
    is_default TINYINT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS ads (
    id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150), organization VARCHAR(190), description TEXT,
    contact VARCHAR(190), image VARCHAR(600), link VARCHAR(600), active TINYINT DEFAULT 1, sort_order INT DEFAULT 0,
    start_date DATE NULL, end_date DATE NULL, is_default TINYINT DEFAULT 0, shown_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS photocards (
    id INT AUTO_INCREMENT PRIMARY KEY, kind VARCHAR(20), uniq VARCHAR(120) NULL UNIQUE, wp_id BIGINT NULL,
    title TEXT, link VARCHAR(600), template_id INT NULL, ad_id INT NULL, file VARCHAR(255),
    origin VARCHAR(20) DEFAULT 'manual', created_by INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (created_at))`,
  `CREATE TABLE IF NOT EXISTS channels (
    id INT AUTO_INCREMENT PRIMARY KEY, platform VARCHAR(30), name VARCHAR(150), public_cfg JSON, secret_cfg TEXT,
    active TINYINT DEFAULT 1, use_news TINYINT DEFAULT 1, use_text TINYINT DEFAULT 1, use_schedule TINYINT DEFAULT 1,
    link_in_comment TINYINT DEFAULT 1, status VARCHAR(20) DEFAULT 'unchecked', last_check DATETIME NULL,
    last_error TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS publish_jobs (
    id INT AUTO_INCREMENT PRIMARY KEY, photocard_id INT, channel_id INT, caption TEXT, link VARCHAR(600),
    status VARCHAR(20) DEFAULT 'queued', attempts INT DEFAULT 0, next_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    remote_id VARCHAR(190), error TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_card_channel (photocard_id, channel_id), INDEX (status, next_at))`,
  `CREATE TABLE IF NOT EXISTS bulletins (
    id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150), kind VARCHAR(30), run_time VARCHAR(5),
    active TINYINT DEFAULT 1, message TEXT, card_type VARCHAR(10) DEFAULT 'text', template_id INT NULL,
    channels JSON NULL, source_url VARCHAR(600) NULL, bg_image VARCHAR(600) NULL, auto_publish TINYINT DEFAULT 0,
    last_run_at DATETIME NULL, last_status VARCHAR(20) NULL, last_result TEXT NULL, last_card_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS bulletin_runs (
    bulletin_id INT, run_date DATE, status VARCHAR(20), photocard_id INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (bulletin_id, run_date))`,
  `CREATE TABLE IF NOT EXISTS content_items (
    id INT AUTO_INCREMENT PRIMARY KEY, kind VARCHAR(30), day_month VARCHAR(5) NULL, text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS staff (
    id INT AUTO_INCREMENT PRIMARY KEY, staff_code VARCHAR(50) UNIQUE, name VARCHAR(150), designation VARCHAR(150),
    department VARCHAR(150), blood_group VARCHAR(5), phone VARCHAR(30), expiry DATE NULL, dob DATE NULL,
    photo VARCHAR(255), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY, level VARCHAR(10), area VARCHAR(40), message TEXT, meta JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX (created_at), INDEX (area))`,
  // ---- AI news aggregation ----
  `CREATE TABLE IF NOT EXISTS ai_keys (
    id INT AUTO_INCREMENT PRIMARY KEY, provider VARCHAR(20), label VARCHAR(120), key_enc TEXT, model VARCHAR(120),
    base_url VARCHAR(300) NULL, purpose VARCHAR(20) DEFAULT 'text', priority INT DEFAULT 10, active TINYINT DEFAULT 1,
    calls INT DEFAULT 0, tokens_in BIGINT DEFAULT 0, tokens_out BIGINT DEFAULT 0, fails INT DEFAULT 0,
    last_error TEXT NULL, last_used DATETIME NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS news_sources (
    id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150), site_url VARCHAR(400), type VARCHAR(20) DEFAULT 'rss',
    feed_url VARCHAR(600), wp_category_id BIGINT NULL, wp_category_name VARCHAR(150), language VARCHAR(10) DEFAULT 'bn',
    region VARCHAR(80), image_policy VARCHAR(20) DEFAULT 'none', image_license TEXT, interval_min INT DEFAULT 30,
    daily_limit INT DEFAULT 20, publish_mode VARCHAR(20) DEFAULT 'draft', ai_instructions TEXT, active TINYINT DEFAULT 1,
    last_fetch DATETIME NULL, last_success DATETIME NULL, last_error TEXT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS news_items (
    id INT AUTO_INCREMENT PRIMARY KEY, source_id INT, url VARCHAR(700), url_hash CHAR(40) UNIQUE, title TEXT,
    norm_title VARCHAR(500), fingerprint CHAR(40), summary TEXT, content MEDIUMTEXT, image VARCHAR(700),
    published_at DATETIME NULL, status VARCHAR(20) DEFAULT 'new', duplicate_of INT NULL, error TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX (status), INDEX (created_at), INDEX (fingerprint))`,
  `CREATE TABLE IF NOT EXISTS ai_articles (
    id INT AUTO_INCREMENT PRIMARY KEY, item_id INT UNIQUE, source_id INT, title TEXT, summary TEXT, body MEDIUMTEXT,
    seo_title VARCHAR(300), meta_description VARCHAR(400), tags JSON, alt_text VARCHAR(300), uncertain JSON,
    verification VARCHAR(30), category_id BIGINT NULL, image VARCHAR(700), image_allowed TINYINT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'review', wp_post_id BIGINT NULL, wp_link VARCHAR(600), provider VARCHAR(40),
    error TEXT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX (status))`,
];

const DEFAULT_ADS = [
  ['NCEM', 'নিউ ক্লাসিক ইভেন্ট ম্যানেজমেন্ট', 'https://www.dnbangla.com.bd/wp-content/uploads/2026/03/ads-ncem.jpg'],
  ['Mukti Clinic', 'মুক্তি ক্লিনিক ও ডায়াগনস্টিক সেন্টার', 'https://www.dnbangla.com.bd/wp-content/uploads/2026/03/mukti-clinic.jpg'],
  ['Rupon', 'খাদিজা হুমায়রা রূপন', 'https://www.dnbangla.com.bd/wp-content/uploads/2026/10/ads-khadija-humayra-rupon.jpg'],
  ['Monir Dental', 'মনির ডেন্টাল কেয়ার', 'https://www.dnbangla.com.bd/wp-content/uploads/2026/03/Monir-Dental.jpg'],
  ['NCTTA', 'NCTTA একাডেমি', 'https://www.dnbangla.com.bd/wp-content/uploads/2026/03/NCTTA-Academy.jpg'],
];

// Bulletins from the spec. All times are Asia/Dhaka.
const DEFAULT_BULLETINS = [
  ['শুভ সকাল', 'good_morning', '06:00', 'শুভ সকাল! নতুন দিনের শুভেচ্ছা।'],
  ['আবহাওয়ার আপডেট', 'weather', '06:30', ''],
  ['নামাজের সময়সূচি', 'prayer', '07:00', ''],
  ['দৈনিক স্বাস্থ্য বুলেটিন', 'health', '07:45', ''],
  ['ইতিহাসে আজকের দিন', 'history', '08:15', ''],
  ['জন্মবার্ষিকী ও শ্রদ্ধাঞ্জলি', 'birthday', '08:45', ''],
  ['তাপমাত্রা ও আর্দ্রতা', 'temperature', '13:30', ''],
  ['আবহাওয়ার ঝুঁকি ও সতর্কতা', 'weather_alert', '15:00', ''],
  ['আজকের সেরা ১০ সংবাদ', 'top10', '22:00', ''],
];

const DEFAULT_SETTINGS = {
  wp: { url: 'https://www.dnbangla.com.bd', username: '', auto_detect: true, poll_minutes: 2, last_sync: null, last_status: 'unchecked', last_error: '' },
  location: { city: 'Dhaka', city_bn: 'ঢাকা', country: 'Bangladesh', lat: 23.8103, lon: 90.4125, prayer_method: 1, prayer_school: 1 },
  ad_cycle: { main: 0, text: 0, opening: 0 },
  automation: { enabled: true, news_enabled: false, emergency_stop: false },
  bg_removal: { provider: 'removebg' },
};

export async function initDb() {
  for (const sql of SCHEMA) await q(sql);
  const cols = await q("SHOW COLUMNS FROM users LIKE 'role'");
  if (!cols.length) await q("ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'admin'");

  const u = await one('SELECT COUNT(*) c FROM users');
  if (!u.c) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
    await q('INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)', ['Admin', process.env.ADMIN_EMAIL || 'admin@dnb.com', hash, 'admin']);
  }
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) await q('INSERT IGNORE INTO app_settings (k,v) VALUES (?,?)', [k, JSON.stringify(v)]);

  if (!(await one('SELECT COUNT(*) c FROM ads')).c) {
    let i = 0;
    for (const [name, org, image] of DEFAULT_ADS) await q('INSERT INTO ads (name,organization,image,sort_order) VALUES (?,?,?,?)', [name, org, image, ++i]);
  }
  if (!(await one('SELECT COUNT(*) c FROM bulletins')).c) {
    for (const [name, kind, t, msg] of DEFAULT_BULLETINS) await q('INSERT INTO bulletins (name,kind,run_time,message) VALUES (?,?,?,?)', [name, kind, t, msg]);
  }
  for (const kind of ['main', 'text', 'opening', 'idcard']) {
    if (!(await one('SELECT COUNT(*) c FROM card_templates WHERE kind=?', [kind])).c) {
      await q('INSERT INTO card_templates (kind,name,settings,is_default) VALUES (?,?,?,1)', [kind, 'ডিফল্ট টেমপ্লেট', '{}']);
    }
  }
}

// ---------- settings helpers ----------
export async function getSetting(k, fallback = {}) {
  const r = await one('SELECT v FROM app_settings WHERE k=?', [k]);
  if (!r) return fallback;
  return typeof r.v === 'string' ? JSON.parse(r.v) : r.v;
}
export async function setSetting(k, v) {
  await q('INSERT INTO app_settings (k,v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)', [k, JSON.stringify(v)]);
  return v;
}
export async function patchSetting(k, patch) {
  return setSetting(k, { ...(await getSetting(k)), ...patch });
}

export const json = v => (v == null ? v : typeof v === 'string' ? JSON.parse(v) : v);
