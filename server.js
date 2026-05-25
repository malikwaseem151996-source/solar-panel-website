const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5500;

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://postgres.menmtktnyvpjehwidtwu:Zubeem%408504@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
});

// Prevent idle-connection termination errors (e.g. Supabase 57P01) from crashing the process
pool.on('error', (err) => {
  console.error('Pool idle client error:', err.message);
});

app.use(cors({
  origin: ['https://solarproindia.com', 'https://www.solarproindia.com'],
}));
app.use(express.json());
app.use(express.static(path.join(__dirname)));

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS visitor_logs (
      id          SERIAL PRIMARY KEY,
      ip_address  VARCHAR(45)  NOT NULL,
      user_agent  TEXT,
      page_path   TEXT,
      referer     TEXT,
      visited_at  TIMESTAMPTZ  DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS consultation_leads (
      id                  SERIAL PRIMARY KEY,
      full_name           VARCHAR(200) NOT NULL,
      phone               VARCHAR(20)  NOT NULL,
      email               VARCHAR(200),
      installation_type   VARCHAR(100),
      city_state          VARCHAR(200),
      monthly_bill        VARCHAR(50),
      message             TEXT,
      ip_address          VARCHAR(45),
      submitted_at        TIMESTAMPTZ  DEFAULT NOW()
    );
  `);
  console.log('visitor_logs + consultation_leads tables ready');
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

app.post('/api/track', async (req, res) => {
  try {
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || null;
    const { page_path, referer } = req.body;

    await pool.query(
      `INSERT INTO visitor_logs (ip_address, user_agent, page_path, referer)
       VALUES ($1, $2, $3, $4)`,
      [ip, userAgent, page_path || '/', referer || null]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Track error:', err.message);
    res.status(500).json({ success: false });
  }
});

app.post('/api/consultation', async (req, res) => {
  try {
    const { full_name, phone, email, installation_type, city_state, monthly_bill, message } = req.body;
    if (!full_name || !phone) {
      return res.status(400).json({ success: false, error: 'full_name and phone are required' });
    }
    const ip = getClientIp(req);
    await pool.query(
      `INSERT INTO consultation_leads
         (full_name, phone, email, installation_type, city_state, monthly_bill, message, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [full_name, phone, email || null, installation_type || null, city_state || null, monthly_bill || null, message || null, ip]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Consultation lead error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to save lead' });
  }
});

// Start server immediately so the website is always served
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

// Try to connect to DB (non-fatal if it fails)
initDb().catch((err) => {
  console.error('DB connection failed — visitor tracking disabled:', err.message);
  console.error('To fix: resume your Supabase project at https://app.supabase.com');
});
