const express = require('express');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const session = require('express-session');
const cookieParser = require('cookie-parser');

const app = express();
const port = 3000;

// --- KONEKSI DATABASE ---
const pool = mysql.createPool({
    host: '127.0.0.1',
    user: 'root',
    password: '@dlh010404', // Sesuaikan password Anda
    database: 'apikey_db',
    port: 3309,
    waitForConnections: true,
    connectionLimit: 10
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));

// Session Admin
app.use(session({
    secret: 'kunci_rahasia_negara_api',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 } // 1 Jam
}));

// Middleware Cek Login
const requireAuth = (req, res, next) => {
    if (req.session && req.session.isAdmin) {
        next();
    } else {
        res.redirect('/admin_login.html');
    }
};

// --- ROUTES HALAMAN ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    if (req.session.isAdmin) return res.redirect('/dashboard');
    res.sendFile(path.join(__dirname, 'public', 'admin_login.html'));
});

app.get('/dashboard', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin_dashboard.html'));
});

// --- API ENDPOINTS ---

// 1. Generate Kandidat Key (Hanya string, belum masuk DB)
app.get('/generate-candidate', (req, res) => {
    const timestamp = Math.floor(Date.now() / 1000).toString(36).toUpperCase();
    const rand1 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const rand2 = crypto.randomBytes(4).toString('hex').toUpperCase();
    const apiKey = `KEY-${timestamp}-${rand1}-${rand2}`;
    res.json({ apiKey });
});

// 2. Register User (Simpan ke DB dengan Transaksi)
app.post('/register-user', async (req, res) => {
    const { firstName, lastName, email, apiKeyCandidate } = req.body;

    if (!firstName || !lastName || !email || !apiKeyCandidate) {
        return res.status(400).json({ success: false, message: 'Data tidak lengkap!' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Cek Email
        const [existing] = await conn.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) throw new Error('Email sudah terdaftar!');

        // Simpan Key
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // Expired 30 hari
        const [keyResult] = await conn.execute(
            'INSERT INTO api_keys (api_key, expires_at) VALUES (?, ?)', 
            [apiKeyCandidate, expiresAt]
        );

        // Simpan User (First & Last Name Terpisah)
        await conn.execute(
            'INSERT INTO users (first_name, last_name, email, api_key_id) VALUES (?, ?, ?, ?)', 
            [firstName, lastName, email, keyResult.insertId]
        );

        await conn.commit();
        res.json({ success: true });
    } catch (error) {
        await conn.rollback();
        res.status(500).json({ success: false, message: error.message });
    } finally {
        conn.release();
    }
});

// 3. Login Admin (Menggunakan email)
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body; // <-- Diubah dari username ke email
    try {
        const [rows] = await pool.execute('SELECT * FROM admin WHERE email = ?', [email]); // <-- Diubah dari username ke email
        if (rows.length === 0) return res.status(401).json({ success: false, message: 'Admin tidak ditemukan' });

        const match = await bcrypt.compare(password, rows[0].password);
        if (match) {
            req.session.isAdmin = true;
            res.json({ success: true });
        } else {
            res.status(401).json({ success: false, message: 'Password salah' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// 5. Data Dashboard (Ambil First & Last Name)
app.get('/api/users', requireAuth, async (req, res) => {
    try {
        const sql = `
            SELECT u.id, u.first_name, u.last_name, u.email, k.api_key, k.is_active, k.expires_at 
            FROM users u
            JOIN api_keys k ON u.api_key_id = k.id
            ORDER BY k.created_at DESC
        `;
        const [rows] = await pool.execute(sql);
        
        const now = new Date();
        const data = rows.map(row => {
            let status = 'Active';
            if (!row.is_active) status = 'Nonaktif';
            else if (new Date(row.expires_at) < now) status = 'Expired';
            return { ...row, status };
        });

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 6. Hapus User
app.delete('/api/users/:id', requireAuth, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [u] = await conn.execute('SELECT api_key_id FROM users WHERE id = ?', [req.params.id]);
        if (u.length > 0) {
            await conn.execute('DELETE FROM users WHERE id = ?', [req.params.id]);
            await conn.execute('DELETE FROM api_keys WHERE id = ?', [u[0].api_key_id]);
        }
        await conn.commit();
        res.json({ success: true });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
});


// 7. Register Admin Baru (Menggunakan email)
app.post('/api/register-admin', async (req, res) => {
    const { email, password } = req.body; // <-- Diubah dari username ke email

    if (!email || !password) { // <-- Diubah dari Username ke Email
        return res.status(400).json({ success: false, message: 'Email dan Password wajib diisi!' });
    }

    try {
        // Cek apakah email sudah ada
        const [existing] = await pool.execute('SELECT id FROM admin WHERE email = ?', [email]); // <-- Diubah dari username ke email
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Email sudah digunakan!' });
        }

        // Hash Password
        const saltRounds = 10;
        const hash = await bcrypt.hash(password, saltRounds);

        // Simpan ke Database
        await pool.execute('INSERT INTO admin (email, password) VALUES (?, ?)', [email, hash]); // <-- Diubah dari username ke email

        res.json({ success: true, message: 'Admin berhasil didaftarkan!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 8. Ambil Semua Data API Key (Termasuk yang belum ada user)
app.get('/api/apikeys', requireAuth, async (req, res) => {
    try {
        // LEFT JOIN agar key yang tidak punya user tetap muncul
        // Dan ambil created_at serta expires_at
        const sql = `
            SELECT k.id, k.api_key, k.is_active, k.created_at, k.expires_at, u.email 
            FROM api_keys k
            LEFT JOIN users u ON k.id = u.api_key_id
            ORDER BY k.created_at DESC
        `;
        const [rows] = await pool.execute(sql);
        
        const now = new Date();
        const data = rows.map(row => {
            let status = 'Active';
            const expDate = new Date(row.expires_at);

            // Logika status
            if (!row.is_active) {
                status = 'Nonaktif';
            } else if (expDate < now) {
                status = 'Expired';
            }

            return { 
                ...row, 
                status,
                // Format email jika kosong
                email: row.email || 'Belum ada' 
            };
        });

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 9. Hapus API Key Saja
app.delete('/api/apikeys/:id', requireAuth, async (req, res) => {
    try {
        // Karena ON DELETE CASCADE di database, menghapus key otomatis menghapus user terkait (jika ada)
        await pool.execute('DELETE FROM api_keys WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// 10. Validasi API Key (Dengan detail User dan status)
app.post('/api/validate', async (req, res) => {
    const { api_key } = req.body;

    if (!api_key) {
        return res.status(400).json({ success: false, message: 'API Key wajib disertakan.' });
    }

    try {
        const sql = `
            SELECT 
                k.id, 
                k.is_active, 
                k.expires_at,
                u.first_name, 
                u.last_name, 
                u.email
            FROM api_keys k
            LEFT JOIN users u ON k.id = u.api_key_id
            WHERE k.api_key = ?
        `;
        const [rows] = await pool.execute(sql, [api_key]);

        if (rows.length === 0) {
            return res.status(401).json({ success: false, message: 'API Key tidak valid.' });
        }

        const keyData = rows[0];
        const now = new Date();
        const expiresAt = new Date(keyData.expires_at);

        let statusKey = 'active';

        if (!keyData.is_active) {
            statusKey = 'nonaktif';
            return res.status(403).json({ success: false, message: 'API Key dinonaktifkan.', status: statusKey });
        }
        
        if (expiresAt < now) {
            statusKey = 'expired';
            return res.status(403).json({ success: false, message: 'API Key telah kedaluwarsa.', status: statusKey });
        }
        
        // Key valid, aktif, dan belum expired
        
        // Opsional: Update kolom last_used (last_login)
        //await pool.execute('UPDATE api_keys SET last_used = NOW() WHERE id = ?', [keyData.id]);
        
        // Format respons sesuai permintaan
        res.json({ 
            success: true, 
            message: '✅ API Key valid!', 
            status: statusKey,
            user: {
                nama: keyData.first_name && keyData.last_name ? 
                      `${keyData.first_name} ${keyData.last_name}` : 
                      'N/A',
                email: keyData.email || 'N/A'
            },
            // Menggunakan last_used sebagai last_login (Jika kolom tersedia)
            last_used: new Date().toISOString() 
        });
        
    } catch (error) {
        // Log error di server
        console.error("Validation Error:", error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
});

// 11. Toggle (Aktif/Nonaktif) API Key
app.put('/api/apikeys/toggle/:id', requireAuth, async (req, res) => {
    const keyId = req.params.id;
    const { activate } = req.body; // true = aktifkan, false = matikan

    if (typeof activate !== 'boolean') {
        return res.status(400).json({ success: false, message: 'Payload "activate" harus boolean.' });
    }

    const isActive = activate ? 1 : 0; 
    
    try {
        const [result] = await pool.execute(
            'UPDATE api_keys SET is_active = ? WHERE id = ?', 
            [isActive, keyId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'API Key tidak ditemukan.' });
        }

        const action = activate ? 'diaktifkan' : 'dinonaktifkan';
        res.json({ success: true, message: `API Key ${keyId} berhasil ${action}.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- GANTI BAGIAN PALING BAWAH DENGAN INI ---

// Kita simpan jalannya aplikasi ke dalam variabel bernama 'server'
const server = app.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}`);
});

// Sekarang variabel 'server' sudah ada, jadi bisa kita pasangi pendeteksi error
server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.log('❌ Error Fatal: Port 3000 sedang dipakai aplikasi lain!');
        console.log('👉 Solusi: Matikan terminal lain atau ganti const port = 3001');
    } else {
        console.error('❌ Server Error:', e);
    }
});
