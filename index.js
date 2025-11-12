const express = require('express');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise'); // <-- Memuat modul mysql2
const app = express();
const port = 3000;


// --- KONEKSI DATABASE ---
// Pastikan variabelnya bernama 'pool' dan menggunakan 'createPool'
const pool = mysql.createPool({
  host: '127.0.0.1',       // OK (127.0.0.1 juga bisa)
  user: 'root',            // OK (sesuai gambar)
  password: '@dlh010404',  // Password Anda
  database: 'apikey_db',   // Database Anda
  port: 3309,              // <-- WAJIB 3309 (sesuai gambar Anda)
});

// ... sisa kode Anda (testDbConnection, app.post, dll) ...
// Cek koneksi database saat server pertama kali berjalan
async function testDbConnection() {
  try {
    // Ambil satu koneksi dari pool
    const connection = await pool.getConnection(); 
    // Jika berhasil, cetak pesan sukses
    console.log('Berhasil terhubung ke database MySQL!');
    // Kembalikan koneksi ke pool
    connection.release(); 
  } catch (error) {
    // Jika gagal, cetak pesan error
    console.error('Gagal terhubung ke database:', error.message);
    console.error('Pastikan kredensial (user, password, port, database) sudah benar.');
    process.exit(1); // Keluar dari aplikasi jika database tidak terhubung
  }
}

// Middleware
app.use(express.json());
app.use(express.static('public')); // Untuk menyajikan file index.html, css, js

// Route untuk halaman utama
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint untuk membuat API key
// (Sekarang menjadi fungsi async untuk menunggu database)
app.post('/create', async (req, res) => {
  // 1. Buat API key
  const timestamp = Math.floor(Date.now() / 1000).toString(36);
  const random = crypto.randomBytes(32).toString('base64url');
  const apiKey = sk-itumy-v1-${timestamp}_${random};

  try {
    // 2. Simpan API key ke database
    const sqlQuery = 'INSERT INTO api_keys (api_key) VALUES (?)';
    await pool.execute(sqlQuery, [apiKey]);

    console.log(API Key baru dibuat dan disimpan: ${apiKey});

    // 3. Kirim key kembali ke frontend
    res.json({ apiKey });

  } catch (error) {
    console.error('Gagal menyimpan API key ke database:', error);
    res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
});

