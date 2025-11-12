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
