const express = require('express');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const app = express();
const port = 3000;

// --- KONEKSI DATABASE ---
const pool = mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: '@dlh010404',
  database: 'apikey_db',
  port: 3309,
});

// Fungsi untuk cek koneksi database
async function testDbConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Berhasil terhubung ke database MySQL!');
    connection.release();
  } catch (error) {
    console.error('❌ Gagal terhubung ke database:', error.message);
    console.error('Pastikan host, user, password, port, dan nama database benar.');
    process.exit(1);
  }
}

// -------------------------

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Route halaman utama
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint untuk membuat API key
app.post('/create', async (req, res) => {
  // 1. Buat API key unik
  const timestamp = Math.floor(Date.now() / 1000).toString(36);
  const random = crypto.randomBytes(32).toString('base64url');
  const apiKey = `sk-itumy-v1-${timestamp}_${random}`;

  try {
    // 2. Simpan ke database
    const sqlQuery = 'INSERT INTO api_keys (api_key) VALUES (?)';
    await pool.execute(sqlQuery, [apiKey]);

    console.log(`✅ API Key baru dibuat dan disimpan: ${apiKey}`);

    // 3. Kirimkan ke frontend
    res.json({ apiKey });
  } catch (error) {
    console.error('❌ Gagal menyimpan API key ke database:', error);
    res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
});

// Endpoint untuk validasi API key
app.post('/checkapi', async (req, res) => {
  const { apikey } = req.body;

  if (!apikey) {
    return res.status(400).json({
      valid: false,
      message: 'API key tidak boleh kosong',
    });
  }

  try {
    const sqlQuery = 'SELECT * FROM api_keys WHERE api_key = ? AND is_active = TRUE';
    const [rows] = await pool.execute(sqlQuery, [apikey]);

    if (rows.length > 0) {
      const foundKey = rows[0];
      return res.json({
        valid: true,
        message: 'API key valid',
        data: {
          createdAt: foundKey.created_at,
          isActive: foundKey.is_active,
        },
      });
    } else {
      return res.status(401).json({
        valid: false,
        message: 'API key tidak valid atau tidak ditemukan',
      });
    }
  } catch (error) {
    console.error('❌ Error saat validasi API key:', error);
    res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
});

// Jalankan server
app.listen(port, () => {
  console.log(`🚀 Server berjalan di http://localhost:${port}`);
  testDbConnection();
});
