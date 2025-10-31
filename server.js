import sharp from 'sharp';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
// Utility untuk __dirname di ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import dotenv from 'dotenv';
import qrcode from 'qrcode-terminal';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;

// Pastikan file ini ada di ./config/db.js
// Pastikan arah path-nya benar ya cs (misal file kamu bernama database.js)
import db, { dbPromise } from './config/db.js';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import express, { Router } from 'express';
import cors from 'cors';
import paymentRoutes from './routes/payments.js';

// === IMPORT DAN SETUP MULTER (Diperbaiki menggunakan import) ===
import multer from 'multer';

// ===========================================
// ⚙️ KONFIGURASI DASAR & INISIALISASI EXPRESS
// (Dipindahkan ke atas sebelum app.use)
// ===========================================
dotenv.config();
const app = express(); // <-- PENTING: Inisialisasi 'app' di sini

const allowedOrigin = ['https://zxhw55kz-3000.asse.devtunnels.ms', 'https://antertah.vercel.app'];
const corsOptions = {
  origin: allowedOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  credentials: true
};

// Middleware dasar
app.use(cors(corsOptions));
app.use(express.json());

// ===========================================
// 🔑 KONSTANTA
// ===========================================
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET || 'kunci_rahasia_super_aman_ganti_ini';


// ===========================================
// ⬆️ KONFIGURASI DAN MIDLEWARE MULTER
// ===========================================

const uploadDir = path.join(__dirname, 'uploads', 'menu');
if (!fs.existsSync(uploadDir)) {
fs.mkdirSync(uploadDir, { recursive: true }); // buat folder jika belum ada
console.log('[DEBUG] Folder uploads/menu dibuat otomatis');
}
// Folder untuk menyimpan gambar menu
const storage = multer.diskStorage({
destination: (req, file, cb) => {
cb(null, 'uploads/menu'); // ✅ Konsisten dengan GET route
},
filename: (req, file, cb) => {
const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
const ext = path.extname(file.originalname);
cb(null, `menu-${uniqueSuffix}${ext}`);
}
});

const upload = multer({
storage,
limits: {
fileSize: 2 * 1024 * 1024, // Maks 2MB per file
files: 3 // Maksimal 3 file sekaligus
},
fileFilter: (req, file, cb) => {
const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
const ext = path.extname(file.originalname).toLowerCase();

if (!allowed.includes(ext)) {
console.warn(`[UPLOAD WARNING] Format file tidak didukung: ${file.originalname}`);
return cb(new Error('⚠️ Hanya file gambar (JPG, PNG, WEBP) yang diperbolehkan'));
}

cb(null, true);
}
});

// Pastikan folder upload bisa diakses dari web
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// ===========================================
// 🧱 STATIC FILES
// ===========================================
app.use('/dist', express.static(path.join(__dirname, 'dist')));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/img', express.static(path.join(__dirname, 'public', 'img')));

// Halaman utama
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'home.html'));
});


//Hitung Jarak Otomatis
// === FUNGSI HITUNG JARAK BERDASARKAN KOORDINAT (KM) ===
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // radius bumi dalam km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // hasil dalam KM
}

// ===========================================
// 🔐 MIDDLEWARE AUTENTIKASI DENGAN DEBUGGING
// ===========================================
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  console.log(`[DEBUG AUTH] Request: ${req.originalUrl} | Token ada: ${!!token}`);

  // --- Rute publik ---
  const isPublic =
    req.originalUrl.startsWith('/api/menu/public') || // daftar menu publik
    /^\/api\/menu\/\d+$/.test(req.originalUrl) ||     // produk detail (angka ID)
    req.originalUrl.startsWith('/api/products/list');  // daftar produk

  if (isPublic) {
    console.log(`[DEBUG AUTH] 🚀 Melewati autentikasi untuk rute publik: ${req.originalUrl}`);
    return next();
  }

  // --- Token wajib untuk rute selain publik ---
  if (!token) {
    console.warn(`[DEBUG AUTH] ⚠️ Token hilang untuk ${req.originalUrl}`);
    return res.status(401).json({ error: 'Token tidak ditemukan.' });
  }

  // --- Verifikasi token ---
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      console.error(`[DEBUG AUTH] ❌ Token tidak valid: ${err.message}`);
      return res.status(403).json({ error: 'Token tidak valid atau kadaluarsa.' });
    }
    req.user = user;
    console.log(`[DEBUG AUTH] ✅ Token valid. User: ${user.phone || user.id}`);
    next();
  });
}

// ===========================================
// admin login route
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
   
  if (!token) {
    console.warn(`[DEBUG ADMIN AUTH] ⚠️ Token admin hilang.`);
    return res.status(401).json({ error: 'Token tidak ditemukan.' });
  }

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      console.error(`[DEBUG ADMIN AUTH] ❌ Token admin tidak valid. Error: ${err.message}`);
      return res.status(403).json({ error: 'Token tidak valid.' });
    }
    
    // Periksa role admin (sesuai payload di rute /api/login)
    if (user.role !== 'admin') {
      console.warn(`[DEBUG ADMIN AUTH] ⚠️ Akses ditolak. User ${user.username || user.phone} bukan admin.`);
      return res.status(403).json({ error: 'Akses ditolak. Hanya untuk admin.' });
    }
    
    req.user = user; // user is { id, username, role }
    console.log(`[DEBUG ADMIN AUTH] ✅ Akses ADMIN diberikan untuk: ${user.username}`);
    next();
  });
}
// Rute Login Sederhana untuk Admin
app.post('/api/login', (req, res) => {
const { username, password } = req.body;

// --- LOGIC OTENTIKASI SANGAT SEDERHANA (HANYA UNTUK DEV LOKAL) ---
// GANTI ini dengan otentikasi database yang sebenarnya!
if (username === 'admin' && password === '123456') {

// Payload JWT: data yang ingin Anda simpan di token
const payload = {
id: 1,
username: username,
role: 'admin'
};

// Buat Token, kadaluarsa dalam 1 jam
const token = jwt.sign(payload, SECRET_KEY, { expiresIn: '7h' });

console.log(`[DEBUG AUTH] ✅ Admin ${username} berhasil login. Token dibuat.`);

// Kirim token kembali ke client
return res.status(200).json({
success: true,
message: 'Login berhasil',
token: token
});

} else {
console.warn(`[DEBUG AUTH] ⚠️ Gagal login untuk user: ${username}`);
return res.status(401).json({
success: false,
error: 'Username atau password salah.'
});
}
});

// ===========================================
// 📲 WHATSAPP BOT & UTILITAS
// ===========================================


const client = new Client({
authStrategy: new LocalAuth({
clientId: "test-session"
}),
puppeteer: {
executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
headless: false,
args: ["--no-sandbox", "--disable-setuid-sandbox"]
},
webVersionCache: {
type: "remote",
remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html"
}
});

client.on("disconnected", async (reason) => {
console.log(`Disconnected: ${reason}`);
try {
await client.destroy();
} catch (error) {
console.error("Error destroying client:", error.message);
}
});

client.on("ready", () => {
console.log("Whatsapp Otp Siap❤️❤️");
// Make client globally available for payment routes
global.whatsappClient = client;
});

client.on("auth_failure", msg => {
console.error("Authentication failure:", msg);
});

client.on("qr", qr => {
console.log("QR Code received, please scan!");
qrcode.generate(qr, { small: true });
});

// Initialize with error handling
try {
client.initialize().catch(err => {
console.error("Failed to initialize WhatsApp client:", err.message);
console.log("Server will continue without WhatsApp functionality");
});
} catch (error) {
console.error("WhatsApp client initialization error:", error.message);
console.log("Server will continue without WhatsApp functionality");
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ===========================================
// 🔒 ENDPOINT: OTP & LOGIN DENGAN DEBUGGING
// ===========================================

// 🔹 Endpoint: kirim OTP ke nomor WhatsApp
app.post('/send-otp', async (req, res) => {
    let { phone } = req.body;
    console.log(`[DEBUG OTP] POST /send-otp. Nomor diterima: ${phone}`);

    if (!phone) {
        console.error('[DEBUG OTP] ❌ Validasi Gagal: Nomor HP kosong.');
        return res.status(400).json({ error: 'Nomor HP wajib diisi' });
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);

    try {
        let finalPhoneNumber = phone.replace(/\D/g, '');

        if (finalPhoneNumber.startsWith('0')) {
            finalPhoneNumber = '62' + finalPhoneNumber.slice(1);
        } else if (!finalPhoneNumber.startsWith('62')) {
            finalPhoneNumber = '62' + finalPhoneNumber;
        }
       
        console.log(`[DEBUG OTP] Nomor HP diformat: ${finalPhoneNumber}`);

// Hapus OTP lama dan masukkan yang baru (atau update)
const dbPromise = db.promise();
await dbPromise.query('DELETE FROM otp_codes WHERE phone = ?', [finalPhoneNumber]);
await dbPromise.query(
'INSERT INTO otp_codes (phone, otp, expires_at) VALUES (?, ?, ?)',
[finalPhoneNumber, otp, expiresAt]
);
        console.log(`[DEBUG OTP] ✅ OTP (${otp}) berhasil disimpan ke DB.`);

        const chatId = `${finalPhoneNumber}@c.us`;
        await client.sendMessage(chatId, `🔐 Kode OTP AnterTah kamu adalah *${otp}*.\nBerlaku 2 menit.`);
        console.log(`[DEBUG OTP] ✅ Pesan WhatsApp terkirim.`);

        res.json({ success: true, message: 'OTP berhasil dikirim!', phone: finalPhoneNumber });

    } catch (error) {
        console.error('❌ Gagal kirim OTP:', error);
        res.status(500).json({ error: 'Gagal mengirim OTP, coba lagi.' });
    }
});

// 🔹 Endpoint: verifikasi OTP
app.post('/verify-otp', async (req, res) => {
    const { phone, otp } = req.body;
    console.log(`[DEBUG VERIFY] POST /verify-otp. Phone: ${phone}, OTP: ${otp}`);

    if (!phone || !otp) {
        console.error('[DEBUG VERIFY] ❌ Validasi Gagal: Nomor HP atau OTP kosong.');
        return res.status(400).json({ error: 'Nomor HP dan Kode OTP wajib diisi.' });
    }

    try {
const dbPromise = db.promise();
const [otpRows] = await dbPromise.query(
'SELECT * FROM otp_codes WHERE phone = ? AND otp = ? AND expires_at > NOW()',
[phone, otp]
);

        if (otpRows.length === 0) {
            console.warn('[DEBUG VERIFY] ⚠️ OTP tidak ditemukan/kadaluarsa/salah.');
            return res.status(400).json({ error: 'Kode OTP tidak valid atau sudah kadaluarsa.' });
        }
       
console.log('[DEBUG VERIFY] ✅ OTP valid. Menghapus kode dari DB.');
await dbPromise.query('DELETE FROM otp_codes WHERE phone = ?', [phone]);

const [userRows] = await dbPromise.query(
'SELECT name, is_profile_complete FROM users WHERE phone = ?',
[phone]
);

        let userName = null;
        let isProfileComplete = 0;
       
        if (userRows.length > 0) {
            userName = userRows[0].name;
            isProfileComplete = userRows[0].is_profile_complete;
            console.log(`[DEBUG VERIFY] Pengguna ${phone} sudah ada. Nama: ${userName}`);
        } else {
// Pengguna baru: Inisialisasi user di tabel users
await dbPromise.query('INSERT INTO users (phone, is_profile_complete) VALUES (?, 0)', [phone]);
            console.log(`[DEBUG VERIFY] ➕ Pengguna baru ${phone} berhasil dibuat di tabel users.`);
        }
       
        const tokenPayload = { phone: phone };
        const token = jwt.sign(tokenPayload, SECRET_KEY, { expiresIn: '7d' });
        console.log(`[DEBUG VERIFY] ✅ Token JWT berhasil dibuat (Berlaku 7 hari).`);

        res.status(200).json({
            success: true,
            message: 'Verifikasi berhasil! Selamat datang.',
            token: token,
            userName: userName,
            isProfileComplete: isProfileComplete
        });

    } catch (error) {
        console.error('❌ Gagal verifikasi OTP:', error);
        res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
    }
});


// =========================================================
// ✏️ RUTE SETUP PROFIL AWAL / TAMBAH ALAMAT BARU
// =========================================================
app.post('/setup-profile', authenticateToken, async (req, res) => {
  const {
    name, provinsi_id, provinsi_name, kabupaten_id, kabupaten_name,
    kecamatan_id, kecamatan_name, kelurahan_id, kelurahan_name,
    kampung, rtrw, latitude, longitude // 🧭 tambahkan ini
  } = req.body;

  const userPhone = req.user.phone;
  console.log(`[DEBUG HYBRID] Menerima request dari ${userPhone}`);

  if (!name || !provinsi_id || !kabupaten_id || !kecamatan_id || !kelurahan_id || !kampung || !rtrw) {
    return res.status(400).json({ error: 'Semua detail alamat wajib diisi.' });
  }

  const fullAddressDetail = `${kampung}, RT/RW ${rtrw}, Kel. ${kelurahan_name}, Kec. ${kecamatan_name}, Prov. ${provinsi_name}`;
  const cityForAddressTable = kabupaten_name;

  try {
    const dbPromise = db.promise();
    const [userCheck] = await dbPromise.query(
      'SELECT is_profile_complete, name FROM users WHERE phone = ?',
      [userPhone]
    );

    if (userCheck.length === 0) {
      return res.status(404).json({ error: 'User tidak ditemukan.' });
    }

    const isNewUser = userCheck[0].is_profile_complete === 0;
    await db.promise().beginTransaction();

    if (isNewUser) {
      console.log(`[DEBUG HYBRID] User baru — setup profil + alamat utama`);

      await dbPromise.query(`
        UPDATE users SET
          name = ?,
          provinsi_id = ?, provinsi_name = ?,
          kabupaten_id = ?, kabupaten_name = ?,
          kecamatan_id = ?, kecamatan_name = ?,
          kelurahan_id = ?, kelurahan_name = ?,
          kampung = ?, rtrw = ?,
          is_profile_complete = 1
        WHERE phone = ?
      `, [
        name,
        provinsi_id, provinsi_name,
        kabupaten_id, kabupaten_name,
        kecamatan_id, kecamatan_name,
        kelurahan_id, kelurahan_name,
        kampung, rtrw,
        userPhone,
        latitude,
        longitude
      ]);

      // 🧭 Tambahkan koordinat ke alamat utama
      await dbPromise.query(
        `INSERT INTO addresses 
          (user_phone, label, recipient_name, address_detail, latitude, longitude, city, postal_code, is_main) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userPhone, 'Rumah Utama', name, fullAddressDetail, latitude, longitude, cityForAddressTable, null, 1]
      );

    } else {
      console.log(`[DEBUG HYBRID] User lama — tambah alamat baru`);

      await dbPromise.query('UPDATE addresses SET is_main = 0 WHERE user_phone = ?', [userPhone]);

      await dbPromise.query(
        `INSERT INTO addresses 
          (user_phone, label, recipient_name, address_detail, latitude, longitude, city, postal_code, is_main)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [userPhone, 'Alamat Tambahan', name, fullAddressDetail, latitude, longitude, cityForAddressTable, null]
      );
    }

    await dbPromise.commit();

    res.status(200).json({
      success: true,
      message: isNewUser
        ? 'Profil dan alamat utama berhasil disimpan dengan koordinat lokasi.'
        : 'Alamat baru berhasil ditambahkan dan dijadikan utama dengan koordinat lokasi.'
    });

  } catch (error) {
    await db.promise().rollback();
    console.error('[DEBUG HYBRID] ❌ Error:', error);
    res.status(500).json({ error: 'Gagal menyimpan data. Cek konsol server untuk detail.' });
  }
});

// =========================================================
// 🔄 RUTE API UNTUK UPDATE PROFIL (PUT /api/profile)
// =========================================================

app.put('/api/profile', authenticateToken, async (req, res) => {
    try {
        const phone = req.user.phone;
        // Ambil data dari frontend (name dan birthdate)
        const { name, birthdate } = req.body;
       
        console.log(`[DEBUG PROFILE] PUT /api/profile: Update data untuk user ${phone}. Data:`, req.body);
       
        if (!name) {
            console.error('[DEBUG PROFILE] ❌ Validasi Gagal: Nama kosong.');
            return res.status(400).json({ error: 'Nama wajib diisi.' });
        }
       
        // Update di tabel 'users'
        const [result] = await db.promise().query(
            'UPDATE users SET name = ?, birthdate = ? WHERE phone = ?',
            [name, birthdate || null, phone]
        );

        if (result.affectedRows === 0) {
            console.warn(`[DEBUG PROFILE] ⚠️ Update 0 baris terpengaruh untuk user ${phone}.`);
            return res.status(404).json({ error: 'Pengguna tidak ditemukan atau tidak ada perubahan data.' });
        }

        console.log(`[DEBUG PROFILE] ✅ Sukses Update Profil untuk ${phone}. Baris terpengaruh: ${result.affectedRows}`);
        return res.status(200).json({
            success: true,
            message: 'Profil berhasil diperbarui.',
            name: name // Kirim kembali data yang diperbarui
        });

    } catch (error) {
        console.error('❌ Gagal update profil:', error);
        return res.status(500).json({ error: 'Server error saat memperbarui profil.' });
    }
});


// =========================================================
// 📍 RUTE API UNTUK MANAJEMEN ALAMAT (CRUD) DENGAN DEBUGGING
// =========================================================

// Inisialisasi Address Router dan terapkan middleware otentikasi
const addressRouter = express.Router();
addressRouter.use(authenticateToken);

// 1. Rute GET: Mengambil daftar alamat pengguna
addressRouter.get('/addresses', async (req, res) => {
    const userPhone = req.user.phone;
    console.log(`[DEBUG ADDRESS] GET /addresses: Memuat alamat untuk user ${userPhone}`);

    try {
        // Mengambil semua alamat pengguna
        const [addresses] = await db.promise().query(
            'SELECT id, label, recipient_name, address_detail, city, postal_code, latitude, longitude, is_main FROM addresses WHERE user_phone = ? ORDER BY is_main DESC, id DESC',
            [userPhone]
        );

        console.log(`[DEBUG ADDRESS] ✅ Sukses memuat. Ditemukan ${addresses.length} alamat.`);
        res.status(200).json(addresses);

    } catch (error) {
        console.error(`[DEBUG ADDRESS] ❌ Gagal memuat daftar alamat untuk ${userPhone}:`, error);
        res.status(500).json({ error: 'Server error saat mengambil alamat.' });
    }
});

// 2. Rute POST: Menambahkan alamat baru
addressRouter.post('/addresses', async (req, res) => {
    const userPhone = req.user.phone;
    const { label, recipient_name, address_detail, city, postal_code, is_main, latitude, longitude } = req.body;
    const isMainStatus = is_main ? 1 : 0;

    console.log(`[DEBUG ADDRESS] POST /addresses: Menambah alamat baru untuk ${userPhone}. Data:`, req.body);

    if (!label || !recipient_name || !address_detail || !city) {
        console.error('[DEBUG ADDRESS] ❌ Validasi Gagal: Field alamat tidak lengkap.');
        return res.status(400).json({ error: 'Semua field alamat wajib diisi.' });
    }
   
    try {
        // Logika PENTING: Jika alamat ini dijadikan utama (is_main = 1), reset alamat lain
        if (isMainStatus === 1) {
            console.log("[DEBUG ADDRESS] Mereset status is_main=0 untuk alamat lama.");
            await db.promise().query('UPDATE addresses SET is_main = 0 WHERE user_phone = ?', [userPhone]);
        }
       
        // Insert alamat baru
        const [result] = await db.promise().query(
            'INSERT INTO addresses (user_phone, label, recipient_name, address_detail, city, postal_code, is_main) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [userPhone, label, recipient_name, address_detail, city, postal_code || null, isMainStatus, latitude, longitude]
        );
       
        console.log(`[DEBUG ADDRESS] ✅ Sukses INSERT. ID baru: ${result.insertId}`);
        res.status(201).json({ success: true, message: 'Alamat berhasil ditambahkan.', id: result.insertId });

    } catch (error) {
        console.error('[DEBUG ADDRESS] ❌ Gagal menambahkan alamat:', error);
        res.status(500).json({ error: 'Server error saat menambahkan alamat.' });
    }
});


// 3. Rute PUT: Memperbarui alamat tertentu
addressRouter.put('/addresses/:id', async (req, res) => {
    const addressId = req.params.id;
    const userPhone = req.user.phone;
    const { label, recipient_name, address_detail, city, postal_code, is_main, latitude, longitude  } = req.body;
    const isMainStatus = is_main ? 1 : 0;

    console.log(`[DEBUG ADDRESS] PUT /addresses/${addressId}: Update alamat untuk ${userPhone}. Data:`, req.body);

    if (!label || !recipient_name || !address_detail || !city) {
        console.error('[DEBUG ADDRESS] ❌ Validasi Gagal: Field alamat tidak lengkap.');
        return res.status(400).json({ error: 'Semua field alamat wajib diisi.' });
    }
   
    try {
        if (isMainStatus === 1) {
            console.log("[DEBUG ADDRESS] Mereset status is_main=0 untuk alamat lama (kecuali ID ini).");
            await db.promise().query(
                'UPDATE addresses SET is_main = 0 WHERE user_phone = ? AND id != ?',
                [userPhone, addressId]
            );
        }
       
        const [result] = await db.promise().query(
            'UPDATE addresses SET label = ?, recipient_name = ?, address_detail = ?, city = ?, postal_code = ?, is_main = ? WHERE id = ? AND user_phone = ?',
            [label, recipient_name, address_detail, city, postal_code || null, isMainStatus, addressId, userPhone, latitude, longitude]
        );
       
        if (result.affectedRows === 0) {
            console.warn(`[DEBUG ADDRESS] ⚠️ Update 0 baris terpengaruh untuk ID ${addressId}.`);
            return res.status(404).json({ error: 'Alamat tidak ditemukan atau bukan milik pengguna ini.' });
        }

        console.log(`[DEBUG ADDRESS] ✅ Sukses UPDATE alamat ID ${addressId}. Baris terpengaruh: ${result.affectedRows}`);
        res.status(200).json({ success: true, message: 'Alamat berhasil diperbarui.' });

    } catch (error) {
        console.error(`[DEBUG ADDRESS] ❌ Gagal memperbarui alamat ${addressId}:`, error);
        res.status(500).json({ error: 'Server error saat memperbarui alamat.' });
    }
});

// 4. Rute DELETE: Menghapus alamat tertentu
addressRouter.delete('/addresses/:id', async (req, res) => {
    const addressId = req.params.id;
    const userPhone = req.user.phone;

    console.log(`[DEBUG ADDRESS] DELETE /addresses/${addressId} oleh User: ${userPhone}`);

    try {
        const [result] = await db.promise().query(
            'DELETE FROM addresses WHERE id = ? AND user_phone = ?',
            [addressId, userPhone]
        );

        if (result.affectedRows === 0) {
            console.warn(`[DEBUG ADDRESS] ⚠️ Delete 0 baris terpengaruh untuk ID ${addressId}.`);
            return res.status(404).json({ error: 'Alamat tidak ditemukan atau Anda tidak berhak menghapusnya.' });
        }

        console.log(`[DEBUG ADDRESS] ✅ Alamat ID ${addressId} berhasil dihapus.`);
        res.status(200).json({ success: true, message: 'Alamat berhasil dihapus.' });

    } catch (error) {
        console.error('[DEBUG ADDRESS] ❌ Gagal menghapus alamat:', error);
        res.status(500).json({ error: 'Server error saat menghapus alamat.' });
    }
});

// Pasang Address Router di path /api
app.use('/api', addressRouter);


// =========================================================
// 👤 RUTE PROFIL GET DENGAN DEBUGGING (DIPERBAIKI: Tambah birthdate)
// =========================================================

// Rute GET: Mengambil data profil DAN ALAMAT UTAMA
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const phone = req.user.phone;
        console.log(`[DEBUG PROFILE] GET /api/profile. User: ${phone}`);
       
        // 1. Ambil data dasar pengguna (DIPERBAIKI: Tambah birthdate di SELECT)
        const [userRows] = await db.promise().query(
            'SELECT name, email, phone, birthdate, is_profile_complete FROM users WHERE phone = ?',
            [phone]
        );

        if (userRows.length === 0) {
            console.error('[DEBUG PROFILE] ❌ Pengguna tidak ditemukan di DB.');
            return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
        }
       
        console.log(`[DEBUG PROFILE] Data user dasar ditemukan:`, userRows[0]);
       
        // 2. Ambil alamat utama (is_main = 1)
        const [addressRows] = await db.promise().query(
            'SELECT label, recipient_name, address_detail, city, postal_code FROM addresses WHERE user_phone = ? AND is_main = 1 LIMIT 1',
            [phone]
        );
       
        console.log(`[DEBUG PROFILE] Jumlah alamat utama ditemukan: ${addressRows.length}`);

        let mainAddress = null;
        if (addressRows.length > 0) {
            const address = addressRows[0];
           
            mainAddress = {
                label: address.label,
                recipient: address.recipient_name,
                detail: address.address_detail,
                city: address.city,
                postal_code: address.postal_code,
                full_address_text: `${address.label}: ${address.address_detail}, ${address.city}. Kodepos: ${address.postal_code || '-'}` // Dibuat ulang agar lebih jelas
            };
            console.log(`[DEBUG PROFILE] ✅ Alamat utama ditemukan.`);
        } else {
            console.warn(`[DEBUG PROFILE] ⚠️ Alamat utama tidak ditemukan.`);
        }

        // 3. KIRIM RESPON JSON (Pastikan semua kunci yang diminta frontend ada)
        return res.status(200).json({
            name: userRows[0].name,
            email: userRows[0].email,
            phone: userRows[0].phone,
            birthdate: userRows[0].birthdate,
            is_profile_complete: userRows[0].is_profile_complete,
            address_main: mainAddress
        });

    } catch (error) {
        console.error('❌ Gagal mengambil profil:', error);
        return res.status(500).json({ error: 'Server error.' });
    }
});


// =========================================================
// 🗺️ RUTE WILAYAH (EKSTERNAL API) DENGAN DEBUGGING
// =========================================================

const wilRouter = Router();
const EXTERNAL_API_BASE = 'https://wilayah.id/api';

wilRouter.get('/:level', async (req, res) => {
    const level = req.params.level;
    const parentId = req.query.parent_id;
    let externalUrl = '';

    console.log(`[DEBUG WIL] GET /wilayah/${level}. Parent ID: ${parentId}`);

    try {
        if (level === 'provinsi') {
            externalUrl = `${EXTERNAL_API_BASE}/provinces.json`;
        } else if (level === 'kabupaten' && parentId) {
            externalUrl = `${EXTERNAL_API_BASE}/regencies/${parentId}.json`;
        } else if (level === 'kecamatan' && parentId) {
            externalUrl = `${EXTERNAL_API_BASE}/districts/${parentId}.json`;
        } else if (level === 'kelurahan' && parentId) {
            externalUrl = `${EXTERNAL_API_BASE}/villages/${parentId}.json`;
        } else {
            console.error('[DEBUG WIL] ❌ Validasi Gagal: Level atau ID induk tidak valid.');
            return res.status(400).json({ error: 'Level atau ID induk tidak valid/hilang.' });
        }
       
        console.log(`[DEBUG WIL] URL Eksternal: ${externalUrl}`);

        const response = await axios.get(externalUrl);
        const externalResponse = response.data;
       
        let externalData = externalResponse.data || externalResponse; // Perbaikan jika API mengembalikan langsung array

        const normalizedData = externalData.map(item => ({
            id: item.code,
            nama: item.name
        }));
       
        console.log(`[DEBUG WIL] ✅ Sukses memuat. Mengirim ${normalizedData.length} data.`);
        res.json(normalizedData);
    } catch (error) {
        console.error(`[DEBUG WIL] ❌ API Wilayah Error (${level}):`, error.message);
        res.status(500).json({ error: 'Gagal memuat data wilayah. Cek koneksi atau URL API eksternal.' });
    }
});

// Pasang Wilayah Router

// =========================================================
// 🍔 RUTE API UNTUK MENU/KULINER DENGAN DEBUGGING
// (Rute Admin: POST/PUT/DELETE harus diproteksi dengan middleware admin jika ada,
//  namun di sini saya fokus ke perbaikan duplikasi rute POST)
// =========================================================

// 1. Rute GET: Mengambil semua menu (Publik)
// ✅ TAMBAHKAN: Rute GET khusus Admin - Tampilkan SEMUA menu (termasuk yang tidak tersedia)
app.get('/api/menu/public', async (req, res) => {
    console.log(`[DEBUG MENU] GET /api/menu/public: Memuat SEMUA menu untuk publik.`);

    try {
        // Query database
        const [menu] = await db.promise().query(`
            SELECT
                id, name, description, price, category,
                location_name, latitude, longitude,
                image_url, image_urls, thumbnail_url, thumbnail_urls, is_available
            FROM menu
            ORDER BY category, id
        `);

        // Proses data
        const parsedMenu = menu.map(item => {
            const {
                id, name, description, price, category,
                location_name, latitude, longitude,
                image_url, image_urls, thumbnail_url, thumbnail_urls, is_available
            } = item;

            let images = [];
            let thumbnails = [];
            let firstImageName = image_url || '';

            // Parsing image_urls
            try {
                if (image_urls) {
                    const rawImages = typeof image_urls === 'string' ? JSON.parse(image_urls) : image_urls;
                    if (Array.isArray(rawImages)) {
                        images = rawImages;
                        if (images.length > 0) {
                            firstImageName = images[0];
                        }
                    }
                }
            } catch (err) {
                console.warn(`[DEBUG MENU] Gagal parse image_urls untuk menu ID ${id}:`, err.message);
            }

            // Parsing thumbnail_urls
            try {
                if (thumbnail_urls) {
                    const rawThumbnails = typeof thumbnail_urls === 'string' ? JSON.parse(thumbnail_urls) : thumbnail_urls;
                    if (Array.isArray(rawThumbnails)) {
                        thumbnails = rawThumbnails;
                    }
                }
            } catch (err) {
                console.warn(`[DEBUG MENU] Gagal parse thumbnail_urls untuk menu ID ${id}:`, err.message);
            }

            return {
                id,
                name,
                description,
                price: parseFloat(price),
                category,
                location_name,
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude),
                is_available,
                image_url: firstImageName,
                image_urls: images,
                thumbnail_url: thumbnail_url,
                thumbnail_urls: thumbnails,
            };
        });

        console.log(`[DEBUG MENU] ✅ Berhasil memuat ${parsedMenu.length} menu.`);
        res.status(200).json(parsedMenu);

    } catch (error) {
        console.error(`[DEBUG MENU] ❌ Gagal memuat menu publik:`, error.message, error);
        res.status(500).json({
            error: 'Server error saat memuat menu. Cek log server untuk detail error.',
            detail: error.message
        });
    }
});

// Endpoint untuk admin dengan autentikasi
app.get('/api/menu/admin', authenticateToken, async (req, res) => {
    console.log(`[DEBUG MENU] GET /api/menu/admin: Memuat SEMUA menu untuk admin.`);

    try {
        const [menu] = await db.promise().query(`
            SELECT
                id, name, description, price, category,
                location_name, latitude, longitude,
                image_url, image_urls, thumbnail_url, thumbnail_urls,
                is_available
            FROM menu
            ORDER BY category, id
        `);

        // Filter item null dan parse JSON array
        const parsedMenu = menu
            .filter(item => item) // hapus null / undefined
            .map(item => ({
                id: item.id || 0,
                name: item.name || '',
                description: item.description || '',
                price: item.price || 0,
                category: item.category || '',
                location_name: item.location_name || '',
                latitude: item.latitude || '',
                longitude: item.longitude || '',
                image_url: item.image_url || '',
                image_urls: parseJSONSafe(item.image_urls),
                thumbnail_url: item.thumbnail_url || '',
                thumbnail_urls: parseJSONSafe(item.thumbnail_urls),
                is_available: item.is_available === 1
            }));

        console.log(`[DEBUG MENU] ✅ Berhasil memuat ${parsedMenu.length} menu.`);
        res.status(200).json(parsedMenu);

    } catch (error) {
        console.error(`[DEBUG MENU] ❌ Gagal memuat menu admin:`, error.message, error);
        res.status(500).json({
            error: 'Server error saat memuat menu. Cek log server untuk detail error.',
            detail: error.message
        });
    }
});

// Helper function: parse JSON aman
function parseJSONSafe(str) {
    try {
        const parsed = JSON.parse(str);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

// 2.1 Rute GET: Mengambil menu berdasarkan ID (Admin - termasuk yang tidak tersedia)
app.get('/api/menu/admin/:id', authenticateToken, async (req, res) => {
const menuId = req.params.id;
console.log(`[DEBUG MENU] GET /api/menu/admin/${menuId}: Memuat detail menu untuk admin.`);

try {
const [rows] = await db.promise().query(
'SELECT id, name, description, price, category, image_url, is_available FROM menu WHERE id = ? LIMIT 1',
[menuId]
);

if (rows.length === 0) {
console.warn(`[DEBUG MENU] ⚠️ Menu ID ${menuId} tidak ditemukan.`);
return res.status(404).json({ error: 'Menu tidak ditemukan.' });
}

console.log(`[DEBUG MENU] ✅ Sukses memuat detail menu ID ${menuId} untuk admin.`);
res.status(200).json(rows[0]);

} catch (error) {
console.error(`[DEBUG MENU] ❌ Gagal memuat detail menu ${menuId}:`, error);
res.status(500).json({ error: 'Server error saat mengambil detail menu.' });
}
});

// ===========================================
// 🧾 RUTE: ORDERS (MySQL) + INISIALISASI TABEL
// ===========================================

async function ensureOrderTables() {
try {
await db.promise().query(`
CREATE TABLE IF NOT EXISTS orders (
id INT AUTO_INCREMENT PRIMARY KEY,
user_phone VARCHAR(32) NOT NULL,
customer_name VARCHAR(255) NOT NULL,
customer_phone VARCHAR(32) NOT NULL,
subtotal INT NOT NULL DEFAULT 0,
shipping INT NOT NULL DEFAULT 0,
discount INT NOT NULL DEFAULT 0,
total INT NOT NULL DEFAULT 0,
status ENUM('pending','processing','ready','delivered','cancelled') NOT NULL DEFAULT 'pending',
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
`);

await db.promise().query(`
CREATE TABLE IF NOT EXISTS order_items (
id INT AUTO_INCREMENT PRIMARY KEY,
order_id INT NOT NULL,
item_id INT NOT NULL,
name VARCHAR(255) NOT NULL,
price INT NOT NULL,
quantity INT NOT NULL,
image_url VARCHAR(512),
CONSTRAINT fk_order_items_order
FOREIGN KEY (order_id) REFERENCES orders(id)
ON DELETE CASCADE
) ENGINE=InnoDB;
`);

console.log('[DEBUG ORDERS] ✅ Tabel orders dan order_items siap.');
} catch (error) {
console.error('[DEBUG ORDERS] ❌ Gagal memastikan tabel orders:', error);
}
}

ensureOrderTables();

// ===========================================
// 🧺 RUTE: CART (MySQL) + INISIALISASI TABEL
// ===========================================

async function ensureCartTables() {
try {
await db.promise().query(`
CREATE TABLE IF NOT EXISTS carts (
id INT AUTO_INCREMENT PRIMARY KEY,
user_phone VARCHAR(32) NOT NULL,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
UNIQUE KEY uniq_user (user_phone)
) ENGINE=InnoDB;
`);

await db.promise().query(`
CREATE TABLE IF NOT EXISTS cart_items (
id INT AUTO_INCREMENT PRIMARY KEY,
cart_id INT NOT NULL,
item_id INT NOT NULL,
name VARCHAR(255) NOT NULL,
price INT NOT NULL,
quantity INT NOT NULL,
image_url VARCHAR(512),
CONSTRAINT fk_cart_items_cart
FOREIGN KEY (cart_id) REFERENCES carts(id)
ON DELETE CASCADE,
UNIQUE KEY uniq_cart_item (cart_id, item_id)
) ENGINE=InnoDB;
`);

console.log('[DEBUG CART] ✅ Tabel carts dan cart_items siap.');
} catch (error) {
console.error('[DEBUG CART] ❌ Gagal memastikan tabel cart:', error);
}
}

ensureCartTables();

async function getOrCreateCartId(userPhone) {
const [rows] = await db.promise().query('SELECT id FROM carts WHERE user_phone = ? LIMIT 1', [userPhone]);
if (rows.length > 0) return rows[0].id;
const [ins] = await db.promise().query('INSERT INTO carts (user_phone) VALUES (?)', [userPhone]);
return ins.insertId;
}

// Ambil cart user
app.get('/api/cart', authenticateToken, async (req, res) => {
try {
const userPhone = req.user.phone;
const cartId = await getOrCreateCartId(userPhone);
const [items] = await db.promise().query(
'SELECT id, item_id, name, price, quantity, image_url FROM cart_items WHERE cart_id = ? ORDER BY id DESC',
[cartId]
);
res.status(200).json({ cartId, items });
} catch (error) {
console.error('[DEBUG CART] ❌ GET /api/cart:', error);
res.status(500).json({ error: 'Gagal memuat keranjang.' });
}
});

// Tambah item ke cart
app.post('/api/cart', authenticateToken, async (req, res) => {
try {
const userPhone = req.user.phone;
const { id: item_id, name, price, image } = req.body || {};
if (!item_id || !name || !price) {
return res.status(400).json({ error: 'Item id, name, dan price wajib.' });
}
const cartId = await getOrCreateCartId(userPhone);
// Upsert quantity +1
const [exists] = await db.promise().query(
'SELECT id, quantity FROM cart_items WHERE cart_id = ? AND item_id = ? LIMIT 1',
[cartId, item_id]
);
if (exists.length > 0) {
await db.promise().query('UPDATE cart_items SET quantity = quantity + 1 WHERE id = ?', [exists[0].id]);
} else {
await db.promise().query(
'INSERT INTO cart_items (cart_id, item_id, name, price, quantity, image_url) VALUES (?, ?, ?, ?, ?, ?)',
[cartId, item_id, name, price, 1, image || null]
);
}
res.status(201).json({ success: true });
} catch (error) {
console.error('[DEBUG CART] ❌ POST /api/cart:', error);
res.status(500).json({ error: 'Gagal menambah item keranjang.' });
}
});

// Update quantity item
app.put('/api/cart/:itemId', authenticateToken, async (req, res) => {
try {
const userPhone = req.user.phone;
const { itemId } = req.params;
const { quantity } = req.body || {};
if (typeof quantity !== 'number') return res.status(400).json({ error: 'Quantity wajib number.' });
const cartId = await getOrCreateCartId(userPhone);
if (quantity <= 0) {
await db.promise().query('DELETE FROM cart_items WHERE cart_id = ? AND item_id = ?', [cartId, itemId]);
return res.status(200).json({ success: true });
}
const [result] = await db.promise().query(
'UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND item_id = ?',
[quantity, cartId, itemId]
);
if (result.affectedRows === 0) return res.status(404).json({ error: 'Item tidak ditemukan.' });
res.status(200).json({ success: true });
} catch (error) {
console.error('[DEBUG CART] ❌ PUT /api/cart/:itemId:', error);
res.status(500).json({ error: 'Gagal mengubah jumlah item.' });
}
});

// Hapus item dari cart
app.delete('/api/cart/:itemId', authenticateToken, async (req, res) => {
try {
const userPhone = req.user.phone;
const { itemId } = req.params;
const cartId = await getOrCreateCartId(userPhone);
const [result] = await db.promise().query('DELETE FROM cart_items WHERE cart_id = ? AND item_id = ?', [cartId, itemId]);
if (result.affectedRows === 0) return res.status(404).json({ error: 'Item tidak ditemukan.' });
res.status(200).json({ success: true });
} catch (error) {
console.error('[DEBUG CART] ❌ DELETE /api/cart/:itemId:', error);
res.status(500).json({ error: 'Gagal menghapus item.' });
}
});

// Kosongkan cart
app.delete('/api/cart', authenticateToken, async (req, res) => {
try {
const userPhone = req.user.phone;
const cartId = await getOrCreateCartId(userPhone);
await db.promise().query('DELETE FROM cart_items WHERE cart_id = ?', [cartId]);
res.status(200).json({ success: true });
} catch (error) {
console.error('[DEBUG CART] ❌ DELETE /api/cart:', error);
res.status(500).json({ error: 'Gagal mengosongkan keranjang.' });
}
});

//payment gateway
// ✅ Update payment method per order
app.put('/api/orders/:id/payment-method', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_method } = req.body;

    if (!payment_method) {
      return res.status(400).json({ error: 'Payment method wajib diisi.' });
    }

    // Update di tabel orders
    const [result] = await db.promise().query(`
      UPDATE orders
      SET payment_method = ?
      WHERE id = ?
    `, [payment_method, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
    }

    res.status(200).json({
      success: true,
      message: `Payment method pesanan ${id} berhasil diupdate.`,
      payment_method
    });

  } catch (err) {
    console.error('[DEBUG UPDATE PAYMENT METHOD] ❌', err);
    res.status(500).json({ error: 'Server error saat update payment method.' });
  }
});


// Endpoint untuk membatalkan pesanan
app.put('/api/orders/:id/cancel', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userPhone = req.user.phone;
        
        console.log(`[DEBUG ORDER] Cancelling order ${id} by user ${userPhone}`);
        
        // Validasi order
        const [orderCheck] = await db.promise().query(
            'SELECT id, status FROM orders WHERE id = ? AND user_phone = ?',
            [id, userPhone]
        );
        
        if (orderCheck.length === 0) {
            console.log(`[DEBUG ORDER] Order not found: ${id} for user ${userPhone}`);
            return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
        }
        
        const order = orderCheck[0];
        
        // Periksa status pesanan
        if (order.status === 'cancelled') {
            console.log(`[DEBUG ORDER] Order already cancelled: ${id}`);
            return res.status(400).json({ error: 'Pesanan sudah dibatalkan' });
        }
        
        if (order.status === 'delivered') {
            console.log(`[DEBUG ORDER] Order already delivered: ${id}`);
            return res.status(400).json({ error: 'Pesanan sudah dikirim, tidak bisa dibatalkan' });
        }
        
        if (order.status === 'processing') {
            console.log(`[DEBUG ORDER] Order already processing: ${id}`);
            return res.status(400).json({ error: 'Pesanan sedang diproses, tidak bisa dibatalkan' });
        }
        
        // Update status pesanan
        await db.promise().query(
            'UPDATE orders SET status = ?, cancelled_at = NOW() WHERE id = ?',
            ['cancelled', id]
        );
        
        console.log(`[DEBUG ORDER] Order ${id} cancelled successfully`);
        
        // Kirim notifikasi ke user
        try {
            await sendUserNotification(userPhone, 'Pesanan Dibatalkan', `Pesanan #${id} telah dibatalkan. Jika ini kesalahan, silakan hubungi admin.`, 'warning');
        } catch (error) {
            console.error('[DEBUG ORDER] Error sending user notification:', error);
        }
        
        res.status(200).json({ 
            success: true, 
            message: 'Pesanan berhasil dibatalkan' 
        });
        
    } catch (error) {
        console.error('[DEBUG ORDER] Error cancelling order:', error);
        res.status(500).json({ error: 'Gagal membatalkan pesanan' });
    }
});

// Fungsi untuk mengirim notifikasi ke user
async function sendUserNotification(userPhone, title, message, type = 'info') {
    try {
        await db.promise().query(
            'INSERT INTO notifications (user_phone, title, message, type, related_type, related_id) VALUES (?, ?, ?, ?, ?, ?)',
            [userPhone, title, message, type, 'order', null]
        );
    } catch (error) {
        console.error('[DEBUG NOTIFICATION] Error sending user notification:', error);
    }
}
//delete order
app.delete('s/:id', authenticateToken, async (req, res) => {
try {
const orderId = req.params.id;

// Cek apakah order ada
const [orderCheck] = await db.promise().query(
'SELECT id, status FROM orders WHERE id = ?', [orderId]
);

if (orderCheck.length === 0) {
return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
}

// Cek apakah order bisa dihapus (status bukan 'delivered' atau 'processing')
const orderStatus = orderCheck[0].status;
if (orderStatus === 'delivered') {
return res.status(400).json({ error: 'Pesanan yang sudah dikirim tidak dapat dihapus.' });
}

if (orderStatus === 'processing') {
return res.status(400).json({ error: 'Pesanan yang sedang diproses tidak dapat dihapus.' });
}

// Hapus item-item pesanan terlebih dahulu
await db.promise().query(
'DELETE FROM order_items WHERE order_id = ?', [orderId]
);

// Hapus pesanan
const [result] = await db.promise().query(
'DELETE FROM orders WHERE id = ?', [orderId]
);

if (result.affectedRows === 0) {
return res.status(500).json({ error: 'Gagal menghapus pesanan.' });
}

console.log(`[DEBUG ORDERS] ✅ Order #${orderId} berhasil dihapus.`);
return res.status(200).json({ success: true, message: 'Pesanan berhasil dihapus.' });
} catch (error) {
console.error('[DEBUG ORDERS] ❌ Gagal menghapus order:', error);
return res.status(500).json({ error: 'Gagal menghapus pesanan.' });
}
});

// Buat order baru (Customer)
app.post('/api/orders', authenticateToken, async (req, res) => {
try {
const userPhoneFromToken = req.user.phone;
const {
items = [],
subtotal = 0,
shipping = 0,
discount = 0,
total = 0,
customer = { name: '', phone: '' },
timestamp,
status = 'pending'
} = req.body || {};

if (!Array.isArray(items) || items.length === 0) {
return res.status(400).json({ error: 'Item pesanan tidak boleh kosong.' });
}

await db.promise().beginTransaction();

const [orderResult] = await db.promise().query(
`INSERT INTO orders (user_phone, customer_name, customer_phone, subtotal, shipping, discount, total, status)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
[
userPhoneFromToken,
customer.name || '',
customer.phone || userPhoneFromToken,
subtotal,
shipping,
discount,
total,
status
]
);

const orderId = orderResult.insertId;

const itemInserts = items.map((it) => [
orderId,
it.id || 0,
it.name || '',
it.price || 0,
it.quantity || 1,
it.image || it.image_url || null
]);

await db.promise().query(
`INSERT INTO order_items (order_id, item_id, name, price, quantity, image_url)
VALUES ?`,
[itemInserts]
);

await db.promise().commit();

console.log(`[DEBUG ORDERS] ✅ Order baru dibuat. ID: ${orderId}, User: ${userPhoneFromToken}`);
return res.status(201).json({ success: true, orderId });
} catch (error) {
await db.promise().rollback();
console.error('[DEBUG ORDERS] ❌ Gagal membuat order:', error);
return res.status(500).json({ error: 'Gagal membuat pesanan.' });
}
});

// ✅ Ambil semua pesanan user (tanpa ID)
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const userPhone = req.user.phone;
    console.log(`[DEBUG ORDER] GET /api/orders untuk user ${userPhone}`);

    // Ambil semua order beserta items sekaligus
    const [orders] = await db.promise().query(`
      SELECT 
        o.id,
        o.subtotal,
        o.shipping,
        o.discount,
        o.total,
        o.status,
        o.payment_method,
        o.created_at,
        COALESCE(JSON_ARRAYAGG(
          JSON_OBJECT(
            'menu_id', oi.item_id,
            'name', m.name,
            'category', m.category,
            'image_url', m.image_url,
            'price', oi.price,
            'quantity', oi.quantity
          )
        ), JSON_ARRAY()) AS items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN menu m ON oi.item_id = m.id
      WHERE o.user_phone = ?
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `, [userPhone]);

    if (orders.length === 0) {
      console.log(`[DEBUG ORDER] Tidak ada pesanan untuk ${userPhone}`);
      return res.status(200).json({ success: true, orders: [] });
    }

    console.log(`[DEBUG ORDER] Ditemukan ${orders.length} pesanan`);
    res.status(200).json({ success: true, orders });

  } catch (err) {
    console.error('[DEBUG GET ORDERS WITH ITEMS] ❌', err);
    res.status(500).json({ error: 'Gagal memuat daftar pesanan' });
  }
});

// Endpoint untuk mendapatkan detail pesanan berdasarkan ID
app.get('/api/orders/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userPhone = req.user.phone;
        
        console.log(`[DEBUG ORDER] Fetching order ${id} for user ${userPhone}`);
        
        // Query untuk mendapatkan detail pesanan
        const [orders] = await db.promise().query(`
            SELECT 
                o.id, 
                o.subtotal, 
                o.shipping, 
                o.discount, 
                o.total, 
                o.status, 
                o.payment_method,
                o.payment_proof,
                o.payment_note,
                o.payment_date,
                o.created_at,
                o.customer_name,
                o.customer_phone,
                o.address_detail,
                o.city,
                o.postal_code
            FROM orders o
            WHERE o.id = ? AND o.user_phone = ?
        `, [id, userPhone]);
        
        if (orders.length === 0) {
            console.log(`[DEBUG ORDER] Order not found: ${id} for user ${userPhone}`);
            return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
        }
        
        const order = orders[0];
        console.log(`[DEBUG ORDER] Found order: ${JSON.stringify(order)}`);
        
        // Ambil item-item pesanan
        try {
           const [items] = await db.promise().query(`
            SELECT 
                oi.item_id AS menu_id, 
                oi.quantity, 
                oi.price,
                oi.name,
                oi.image_url,
                m.image_urls
            FROM order_items oi
            LEFT JOIN menu m ON oi.item_id = m.id
            WHERE oi.order_id = ?
        `, [id]);

            
            console.log(`[DEBUG ORDER] Found ${items.length} items`);
            order.items = items;
        } catch (error) {
            console.error('[DEBUG ORDER] Error fetching order items:', error);
            order.items = [];
        }
        
        // Ambil data alamat
        try {
            const [addressData] = await db.promise().query(`
                SELECT 
                    recipient_name,
                    phone,
                    address_detail,
                    city,
                    postal_code
                FROM addresses
                WHERE user_phone = ? AND is_main = 1
            `, [userPhone]);
            
            if (addressData.length > 0) {
                order.address = addressData[0];
                console.log(`[DEBUG ORDER] Found address: ${JSON.stringify(order.address)}`);
            } else {
                // Fallback ke alamat dari tabel orders jika tidak ada di tabel addresses
                order.address = {
                    recipient_name: order.customer_name,
                    phone: order.customer_phone,
                    address_detail: order.address_detail,
                    city: order.city,
                    postal_code: order.postal_code
                };
                console.log(`[DEBUG ORDER] Using fallback address from orders table`);
            }
        } catch (error) {
            console.error('[DEBUG ORDER] Error fetching address:', error);
            // Gunakan alamat dari tabel orders sebagai fallback
            order.address = {
                recipient_name: order.customer_name,
                phone: order.customer_phone,
                address_detail: order.address_detail,
                city: order.city,
                postal_code: order.postal_code
            };
        }
        
        // Ambil data ongkir jika ada
        try {
            const [shippingData] = await db.promise().query(`
                SELECT menu_id, cost, distance
                FROM shipping_costs
                WHERE order_id = ?
            `, [id]);
            
            const shippingCosts = {};
            shippingData.forEach(item => {
                shippingCosts[item.menu_id] = {
                    cost: item.cost,
                    distance: item.distance
                };
            });
            
            order.shipping_costs = shippingCosts;
            console.log(`[DEBUG ORDER] Found shipping costs for ${Object.keys(shippingCosts).length} items`);
        } catch (error) {
            console.error('[DEBUG ORDER] Error fetching shipping costs:', error);
            order.shipping_costs = {};
        }
        
        // Format data alamat
        const address = {
            recipient_name: order.address?.recipient_name || order.customer_name,
            phone: order.address?.phone || order.customer_phone,
            address_detail: order.address?.address_detail || order.address_detail,
            city: order.address?.city || order.city,
            postal_code: order.address?.postal_code || order.postal_code
        };
        
        // Format data customer
        const customer = {
            name: order.customer_name,
            phone: order.customer_phone
        };
        
        // Return data lengkap
        const responseData = {
            id: order.id,
            subtotal: order.subtotal,
            shipping: order.shipping,
            discount: order.discount,
            total: order.total,
            status: order.status,
            payment_method: order.payment_method,
            payment_proof: order.payment_proof,
            payment_note: order.payment_note,
            payment_date: order.payment_date,
            created_at: order.created_at,
            items: order.items,
            address: address,
            customer: customer,
            shipping_costs: order.shipping_costs
        };
        
        console.log(`[DEBUG ORDER] Returning order data: ${JSON.stringify(responseData)}`);
        res.json(responseData);
        
    } catch (error) {
        console.error('[DEBUG ORDER] Error fetching order details:', error);
        res.status(500).json({ error: 'Gagal memuat detail pesanan' });
    }
});
// Update status order (Admin)
app.put('/api/orders/:id/status', authenticateToken, async (req, res) => {
try {
const orderId = req.params.id;
const { status } = req.body || {};
const allowed = ['pending','processing','ready','delivered','cancelled'];
if (!allowed.includes(status)) {
return res.status(400).json({ error: 'Status tidak valid.' });
}

const [result] = await db.promise().query(
'UPDATE orders SET status = ? WHERE id = ?', [status, orderId]
);

if (result.affectedRows === 0) {
return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
}

console.log(`[DEBUG ORDERS] ✅ Status order #${orderId} diubah ke ${status}.`);
return res.status(200).json({ success: true });
} catch (error) {
console.error('[DEBUG ORDERS] ❌ Gagal update status:', error);
return res.status(500).json({ error: 'Gagal mengupdate status pesanan.' });
}
});

// ✅ Ambil semua pesanan (untuk admin)
app.get('/api/admin/orders', authenticateToken, async (req, res) => {
  try {
    const [orders] = await db.promise().query(`
      SELECT 
        o.id, o.customer_name, o.customer_phone, o.total, 
        o.status, o.payment_method, o.payment_proof, 
        o.created_at, o.payment_date
      FROM orders o
      ORDER BY o.created_at DESC
    `);

    res.json(orders);
  } catch (error) {
    console.error('[DEBUG ADMIN ORDERS] ❌', error);
    res.status(500).json({ error: 'Gagal memuat daftar pesanan admin.' });
  }
});


// ✅ Update status pesanan (admin verifikasi)
// =======================
// ✅ RUTE: Ambil detail pesanan lengkap untuk ADMIN
// ✅ Ambil detail pesanan lengkap untuk ADMIN (versi aman)
app.get('/api/admin/orders/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`[ADMIN DEBUG] Memuat detail pesanan ${id}`);

    // Ambil data utama dari orders
    const [orders] = await db.promise().query(`
      SELECT 
        o.id,
        o.user_phone,
        o.customer_name,
        o.customer_phone,
        o.address_detail,
        o.city,
        o.postal_code,
        o.subtotal,
        o.shipping,
        o.discount,
        o.total,
        o.status,
        o.payment_method,    -- ambil payment_method dari orders
        o.payment_proof,
        o.payment_note,
        o.payment_date,
        o.created_at
      FROM orders o
      WHERE o.id = ?
    `, [id]);

    if (orders.length === 0) {
      return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
    }

    const order = orders[0];

    // Ambil item pesanan tanpa payment_method
    const [items] = await db.promise().query(`
      SELECT 
        oi.item_id AS menu_id,
        m.name,
        m.category,
        m.image_url,
        oi.price,
        oi.quantity
      FROM order_items oi
      LEFT JOIN menu m ON oi.item_id = m.id
      WHERE oi.order_id = ?
    `, [id]);

    // Ambil ongkir (jika ada)
    const [shippingCosts] = await db.promise().query(`
      SELECT menu_id, cost, distance
      FROM shipping_costs
      WHERE order_id = ?
    `, [id]);

    const shippingMap = {};
    shippingCosts.forEach(row => {
      shippingMap[row.menu_id] = { cost: row.cost, distance: row.distance };
    });

    order.items = items.map(i => ({
      ...i,
      shipping: shippingMap[i.menu_id]?.cost || 0,
      distance: shippingMap[i.menu_id]?.distance || 0
    }));

    res.status(200).json({
      success: true,
      order
    });

  } catch (err) {
    console.error('[ADMIN DEBUG] ❌ Error:', err);
    res.status(500).json({ error: 'Server error saat memuat detail pesanan.' });
  }
});

// ✅ Update Status Pesanan oleh Admin
// =======================
app.put('/api/admin/orders/:id/status', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, note } = req.body;
        const adminId = req.user.id; // pastikan admin login pakai token

        if (!status) return res.status(400).json({ error: 'Status baru wajib diisi' });

        // Ambil status sekarang
        const [rows] = await db.promise().query('SELECT status FROM orders WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });

        const currentStatus = rows[0].status;

        // Urutan status yang valid
        const validTransitions = {
            pending: 'pending_verification',       // Setelah user upload bukti bayar
            pending_verification: 'processing',    // Admin verifikasi
            processing: 'ready',                   // Pesanan disiapkan
            ready: 'delivered',                    // Pesanan dikirim
        };

        // Cegah update tidak sah
        if (validTransitions[currentStatus] !== status) {
            return res.status(400).json({
                error: `Tidak bisa mengubah status dari "${currentStatus}" ke "${status}". Urutannya harus berurutan.`
            });
        }

        // Update status
        const [result] = await db.promise().query(`
            UPDATE orders 
            SET 
                status = ?, 
                verification_note = ?, 
                verified_by = ?, 
                verified_at = NOW()
            WHERE id = ?
        `, [status, note || null, adminId || null, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Pesanan tidak ditemukan atau gagal diubah' });
        }

        res.json({ 
            success: true, 
            message: `Status pesanan berhasil diubah menjadi "${status}".` 
        });

    } catch (error) {
        console.error('[ERROR UPDATE STATUS]:', error);
        res.status(500).json({ error: 'Terjadi kesalahan saat memperbarui status pesanan' });
    }
});

// Kirim WhatsApp ke admin (notifikasi)
app.post('/api/whatsapp/send', async (req, res) => {
try {
const { message, orderId } = req.body || {};
const adminPhone = process.env.ADMIN_WHATSAPP || process.env.ADMIN_PHONE;
if (!adminPhone) {
return res.status(400).json({ error: 'ADMIN_WHATSAPP belum diset di environment.' });
}

const finalPhone = adminPhone.replace(/\D/g, '').replace(/^0/, '62');
const chatId = `${finalPhone.startsWith('62') ? finalPhone : '62' + finalPhone}@c.us`;

await client.sendMessage(chatId, message || `Pemberitahuan pesanan baru #${orderId}`);

console.log(`[DEBUG WA] ✅ Notifikasi terkirim ke admin: ${adminPhone}`);
return res.status(200).json({ success: true });
} catch (error) {
console.error('[DEBUG WA] ❌ Gagal kirim WA:', error);
return res.status(500).json({ error: 'Gagal mengirim notifikasi WhatsApp.' });
}
});
// Tambahkan di atas (di luar route)


// 3. Rute POST: Tambah menu baru (Admin) - HANYA satu versi dengan upload
// Anda dapat menambahkan middleware isAdmin di depan `upload.single('image')`
app.post('/api/menu', authenticateToken, upload.array('images', 5), async (req, res) => {
    try {
        const { name, description, price, category, location_name, latitude, longitude } = req.body;
        if (!name || !price || !category) return res.status(400).json({ error: 'Nama, harga, kategori wajib diisi.' });
        if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Minimal satu gambar harus diupload.' });

        const images = [];
        const thumbnails = [];
        fs.mkdirSync(path.join('uploads/menu'), { recursive: true });

        for (const file of req.files) {
            const baseName = `menu-${Date.now()}-${Math.round(Math.random()*1e9)}`;
            const fullFile = `${baseName}.webp`;
            const thumbFile = `thumb-${baseName}.webp`;

            const fullPath = path.join('uploads/menu', fullFile);
            const thumbPath = path.join('uploads/menu', thumbFile);

            await sharp(file.path).resize(600).webp({ quality: 80 }).toFile(fullPath);
            await sharp(file.path).resize(150).webp({ quality: 60 }).toFile(thumbPath);

            images.push(fullFile);
            thumbnails.push(thumbFile);

            fs.unlinkSync(file.path);
        }

        const firstImage = images[0];
        const firstThumbnail = thumbnails[0];

        const [result] = await db.promise().query(
            `INSERT INTO menu
            (name, description, price, category, image_url, thumbnail_url, image_urls, thumbnail_urls, location_name, latitude, longitude, is_available)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, description||'', price, category, firstImage, firstThumbnail, JSON.stringify(images), JSON.stringify(thumbnails),
             location_name||'', latitude||null, longitude||null, 1]
        );

        res.status(201).json({
            success: true,
            message: 'Menu berhasil ditambahkan.',
            id: result.insertId,
            image_url: firstImage,
            thumbnail_url: firstThumbnail,
            image_urls: images,
            thumbnail_urls: thumbnails
        });

    } catch (error) {
        console.error('[DEBUG MENU] ❌ Gagal tambah menu:', error);
        if (error instanceof multer.MulterError) return res.status(400).json({ error: `Error Upload: ${error.message}` });
        res.status(500).json({ error: 'Server error saat menyimpan menu.' });
    }
});

//ambil id product menu
// Ambil detail produk berdasarkan ID
app.get('/api/menu/:id', async (req, res) => {
  try {
    const id = req.params.id;

    // Ambil produk utama
    const [rows] = await dbPromise.query('SELECT * FROM menu WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Produk tidak ditemukan' });
    }

    const product = rows[0];

    // Ambil produk terkait (kategori sama, id beda)
    const [related] = await dbPromise.query(
      'SELECT * FROM menu WHERE category = ? AND id != ? LIMIT 6',
      [product.category, id]
    );

    res.json({ product, related });
  } catch (error) {
    console.error('Error ambil detail produk:', error);
    res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
});


//gambar multiple update menu
app.put('/api/menu/:id', authenticateToken, upload.array('images', 5), async (req, res) => {
    const menuId = req.params.id;

    const {
        name, description, price, category,
        location_name, latitude, longitude,
        is_available, existing_image_urls, existing_thumbnail_urls
    } = req.body;

    console.log(`[DEBUG MENU] PUT /api/menu/${menuId}: Memulai update menu.`);

    // 1️⃣ Ambil file baru yang diupload
    let newImageNames = [];
    let newThumbnailNames = [];
    if (req.files && req.files.length > 0) {
        newImageNames = req.files.map(f => f.filename);
        newThumbnailNames = [...newImageNames]; // Asumsi thumbnail sama
    }

    // 2️⃣ Fungsi filter file valid (buang placeholder seperti "9k=")
    const filterValidFiles = arr => Array.isArray(arr) ? arr.filter(f => f && f !== '9k=') : [];

    // 3️⃣ Gabungkan gambar lama valid + baru
    let finalImageUrls = [...filterValidFiles(typeof existing_image_urls === 'string' ? JSON.parse(existing_image_urls) : existing_image_urls), ...newImageNames];
    let finalThumbnailUrls = [...filterValidFiles(typeof existing_thumbnail_urls === 'string' ? JSON.parse(existing_thumbnail_urls) : existing_thumbnail_urls), ...newThumbnailNames];

    // 4️⃣ Tentukan gambar utama (first valid file)
    const firstImageUrl = finalImageUrls.length > 0 ? finalImageUrls[0] : null;
    const firstThumbnailUrl = finalThumbnailUrls.length > 0 ? finalThumbnailUrls[0] : null;

    // 5️⃣ Siapkan data untuk SQL
    const updateData = {
        name,
        description,
        price: price ? parseFloat(price) : undefined,
        category,
        location_name,
        latitude: latitude ? parseFloat(latitude) : undefined,
        longitude: longitude ? parseFloat(longitude) : undefined,
        is_available: is_available !== undefined ? (is_available === '1' || is_available === 1 ? 1 : 0) : 1,
        image_url: firstImageUrl,
        thumbnail_url: firstThumbnailUrl,
        image_urls: JSON.stringify(finalImageUrls),
        thumbnail_urls: JSON.stringify(finalThumbnailUrls)
    };

    // Filter field yang undefined agar tidak ikut update
    const filteredUpdateData = Object.fromEntries(Object.entries(updateData).filter(([k, v]) => v !== undefined));

    const fields = Object.keys(filteredUpdateData).map(k => `${k} = ?`).join(', ');
    const values = Object.values(filteredUpdateData);
    values.push(menuId);

    if (fields.length === 0) {
        console.warn(`[DEBUG MENU] ⚠️ Menu ID ${menuId}: Tidak ada data valid untuk update.`);
        return res.status(400).json({ error: 'Tidak ada data valid untuk update.' });
    }

    try {
        const [result] = await db.promise().query(`UPDATE menu SET ${fields} WHERE id = ?`, values);

        if (result.affectedRows === 0) {
            console.warn(`[DEBUG MENU] ⚠️ Menu ID ${menuId} tidak ditemukan.`);
            return res.status(404).json({ error: 'Menu tidak ditemukan.' });
        }

        console.log(`[DEBUG MENU] ✅ Menu ID ${menuId} berhasil diupdate.`);
        res.status(200).json({
            success: true,
            message: 'Menu berhasil diupdate.',
            id: menuId,
            image_urls: finalImageUrls,
            thumbnail_urls: finalThumbnailUrls,
            image_url: firstImageUrl,
            thumbnail_url: firstThumbnailUrl
        });

    } catch (err) {
        console.error(`[DEBUG MENU] ❌ Gagal update menu ID ${menuId}:`, err);
        res.status(500).json({ error: 'Server error saat update menu.' });
    }
});

// === API: MENU TERDEKAT ===
app.get('/api/menu/nearby', async (req, res) => {
try {
const { lat, lon, radius = 10 } = req.query;

if (!lat || !lon) {
return res.status(400).json({ error: 'Latitude dan longitude wajib diisi.' });
}

const [rows] = await db.promise().query(
`
SELECT
id, name, price, category, image_urls, thumbnail_urls, location_name,
latitude, longitude,
(6371 * acos(
cos(radians(?)) * cos(radians(latitude)) *
cos(radians(longitude) - radians(?)) +
sin(radians(?)) * sin(radians(latitude))
)) AS distance
FROM menu
HAVING distance < ?
ORDER BY distance ASC
`,
[lat, lon, lat, radius]
);

res.json({
success: true,
message: `Menampilkan menu dalam radius ${radius} km.`,
count: rows.length,
data: rows
});
} catch (error) {
console.error('❌ Error nearby menu:', error);
res.status(500).json({ error: 'Gagal memuat menu terdekat.' });
}
});

// Asumsi: 'upload' adalah instance Multer yang sudah didefinisikan sebelumnya
// Contoh: const upload = multer({ storage: storage });

// 4. Rute PUT: Edit menu (Admin)
// Harus ditambahkan middleware Multer di sini
app.put('/api/menu/:id', authenticateToken, upload.array('image'), async (req, res) => {
const menuId = req.params.id;

// ✅ Log untuk debugging
console.log('[DEBUG PUT] req.body:', req.body);
console.log('[DEBUG PUT] req.file:', req.file);

// ✅ Validasi req.body ada
if (!req.body || Object.keys(req.body).length === 0) {
console.error('[DEBUG PUT] ❌ req.body kosong!');
return res.status(400).json({ error: 'Data form tidak diterima. Pastikan menggunakan FormData.' });
}

const { name, description, price, category, image_url, is_available } = req.body;

// Validasi field wajib
if (!name || !price || !category) {
return res.status(400).json({ error: 'Nama, harga, dan kategori wajib diisi.' });
}

console.log(`[DEBUG MENU] PUT /api/menu/${menuId}: Mengedit menu "${name}"`);

// Tentukan URL gambar akhir
let final_image_url = image_url || null;

// Jika ada file baru yang diupload, ganti URL lama
if (req.file) {
final_image_url = req.file.filename; // Simpan hanya nama file
console.log(`[DEBUG PUT] File baru diupload: ${final_image_url}`);
} else {
console.log(`[DEBUG PUT] Tidak ada file baru, gunakan URL lama: ${final_image_url}`);
}

try {
const [result] = await db.promise().query(
`UPDATE menu
SET name=?, description=?, price=?, category=?, image_url=?, is_available=?
WHERE id=?`,
[
name,
description || '',
price,
category,
final_image_url,
is_available === '1' || is_available === 1 ? 1 : 0, // ✅ Handle string/number
menuId
]
);

if (result.affectedRows === 0) {
console.warn(`[DEBUG MENU] ⚠️ Menu ID ${menuId} tidak ditemukan.`);
return res.status(404).json({ error: 'Menu tidak ditemukan.' });
}

console.log(`[DEBUG MENU] ✅ Menu ID ${menuId} berhasil diperbarui.`);
res.status(200).json({
success: true,
message: 'Menu berhasil diperbarui.',
image_url: final_image_url
});

} catch (error) {
console.error(`[DEBUG MENU] ❌ Gagal memperbarui menu:`, error);
res.status(500).json({ error: 'Server error saat memperbarui menu.' });
}
});
// 5. Rute DELETE: Hapus menu (Admin)
app.delete('/api/menu/:id', authenticateToken, async (req, res) => {
  const menuId = req.params.id;
  console.log(`[DEBUG MENU] DELETE /api/menu/${menuId}: Menghapus menu.`);

  try {
    const [result] = await db.promise().query('DELETE FROM menu WHERE id = ?', [menuId]);

    if (result.affectedRows === 0) {
      console.warn(`[DEBUG MENU] ⚠️ Menu ID ${menuId} tidak ditemukan.`);
      return res.status(404).json({ error: 'Menu tidak ditemukan.' });
    }

    console.log(`[DEBUG MENU] ✅ Menu ID ${menuId} berhasil dihapus.`);
    res.status(200).json({ success: true, message: 'Menu berhasil dihapus.' });

  } catch (error) {
    console.error(`[DEBUG MENU] ❌ Gagal menghapus menu:`, error);
    res.status(500).json({ error: 'Server error saat menghapus menu.' });
  }
});
//RUTE ONGKIR OTOMATIS
// === ROUTE: Hitung Ongkir Otomatis ===
// Endpoint untuk menghitung ongkir semua item di keranjang
app.get('/api/shipping-cost/all', authenticateToken, async (req, res) => {
  const userPhone = req.user.phone;

  try {
    // Ambil semua item di keranjang
    const [cartItems] = await db.promise().query(
      `SELECT ci.menu_id, ci.quantity, m.latitude, m.longitude 
       FROM cart_items ci 
       JOIN menu m ON ci.menu_id = m.id 
       JOIN cart c ON ci.cart_id = c.id 
       WHERE c.user_phone = ?`,
      [userPhone]
    );

    if (cartItems.length === 0) {
      return res.status(404).json({ error: 'Keranjang kosong.' });
    }

    // Ambil alamat utama user
    const [addressRows] = await db.promise().query(
      'SELECT latitude, longitude FROM addresses WHERE user_phone = ? AND is_main = 1 LIMIT 1',
      [userPhone]
    );

    if (addressRows.length === 0) {
      return res.status(404).json({ error: 'Alamat utama tidak ditemukan.' });
    }

    const userAddr = addressRows[0];

    if (!userAddr.latitude || !userAddr.longitude) {
      return res.status(400).json({ error: 'Alamat utama belum memiliki koordinat.' });
    }

    // Hitung ongkir untuk setiap item
    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371; // radius bumi (km)
    const baseCost = 2000; // Ongkir dasar (<= 1 km)
    const extraPerKm = 1000; // Biaya tambahan per km berikutnya

    let totalShippingCost = 0;
    let maxDistance = 0;
    const itemCosts = {};

    for (const item of cartItems) {
      const dLat = toRad(item.latitude - userAddr.latitude);
      const dLon = toRad(item.longitude - userAddr.longitude);
      const lat1 = toRad(userAddr.latitude);
      const lat2 = toRad(item.latitude);

      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distanceKm = R * c;

      // Simpan jarak terjauh
      if (distanceKm > maxDistance) {
        maxDistance = distanceKm;
      }

      // Hitung ongkir
      const shippingCost =
        distanceKm <= 1 ? baseCost : baseCost + Math.ceil(distanceKm - 1) * extraPerKm;

      // Simpan ongkir per item
      itemCosts[item.menu_id] = {
        cost: shippingCost,
        distance: distanceKm
      };

      // Tambahkan ke total (hanya item unik, bukan berdasarkan quantity)
      totalShippingCost += shippingCost;
    }

    res.status(200).json({
      success: true,
      total_shipping_cost: totalShippingCost,
      max_distance_km: maxDistance.toFixed(2),
      item_costs: itemCosts
    });
  } catch (error) {
    console.error('[DEBUG SHIPPING] ❌ Error menghitung ongkir:', error);
    res.status(500).json({ error: 'Gagal menghitung ongkir.' });
  }
});
// === RUTE ONGKIR BERDASARKAN JARAK ===
// === RUTE ONGKIR BERDASARKAN JARAK ===
app.get('/api/shipping-cost/:menuId', authenticateToken, async (req, res) => {
  const { menuId } = req.params;
  const userPhone = req.user.phone;
  const addressId = req.query.address_id; // 👈 ambil ID alamat dari query

  try {
    // Ambil koordinat produk
    const [menuRows] = await db.promise().query(
      'SELECT latitude, longitude FROM menu WHERE id = ? LIMIT 1',
      [menuId]
    );
    if (menuRows.length === 0) {
      return res.status(404).json({ error: 'Produk tidak ditemukan.' });
    }

    const product = menuRows[0];

    // Ambil alamat user — bisa alamat utama atau berdasarkan address_id
    let addressQuery, params;
    if (addressId) {
      addressQuery = 'SELECT latitude, longitude FROM addresses WHERE id = ? AND user_phone = ? LIMIT 1';
      params = [addressId, userPhone];
    } else {
      addressQuery = 'SELECT latitude, longitude FROM addresses WHERE user_phone = ? AND is_main = 1 LIMIT 1';
      params = [userPhone];
    }

    const [addressRows] = await db.promise().query(addressQuery, params);

    if (addressRows.length === 0) {
      return res.status(404).json({ error: 'Alamat tidak ditemukan.' });
    }

    const userAddr = addressRows[0];
    if (!userAddr.latitude || !userAddr.longitude) {
      return res.status(400).json({ error: 'Alamat belum memiliki koordinat.' });
    }

    // Hitung jarak (Haversine)
    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371;

    const dLat = toRad(product.latitude - userAddr.latitude);
    const dLon = toRad(product.longitude - userAddr.longitude);
    const lat1 = toRad(userAddr.latitude);
    const lat2 = toRad(product.latitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = R * c;

    // Ongkir berdasarkan jarak
    const baseCost = 2000; // 0–1 km
    const extraPerKm = 1000;

    const shippingCost =
      distanceKm <= 1 ? baseCost : baseCost + Math.ceil(distanceKm - 1) * extraPerKm;

    res.status(200).json({
      success: true,
      distance_km: distanceKm.toFixed(2),
      shipping_cost: shippingCost,
      used_address_id: addressId || 'utama',
      product_location: product,
      user_location: userAddr
    });
  } catch (error) {
    console.error('[DEBUG SHIPPING] ❌ Error menghitung ongkir:', error);
    res.status(500).json({ error: 'Gagal menghitung ongkir.' });
  }
});

// Endpoint untuk upload bukti pembayaran
app.post('/api/payments/upload-proof', authenticateToken, upload.single('payment_proof'), async (req, res) => {
  try {
    const { order_id, payment_method, note, amount } = req.body;
    const userPhone = req.user.phone;
    
    console.log(`[DEBUG PAYMENT] Uploading proof for order ${order_id} by ${userPhone}`);
    
    // Validasi order
    const [orderCheck] = await db.promise().query(
      'SELECT id, total, status FROM orders WHERE id = ? AND user_phone = ?',
      [order_id, userPhone]
    );
    
    if (orderCheck.length === 0) {
      console.log(`[DEBUG PAYMENT] Order not found: ${order_id} for user ${userPhone}`);
      return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
    }
    
    const order = orderCheck[0];
    console.log(`[DEBUG PAYMENT] Order status: ${order.status}`);
    
    // Periksa status pesanan
    if (order.status === 'pending_verification') {
      console.log(`[DEBUG PAYMENT] Order already has payment proof`);
      return res.status(400).json({ 
        error: 'Bukti pembayaran sudah diupload. Silakan tunggu verifikasi dari admin.' 
      });
    }
    
    if (order.status !== 'pending') {
      console.log(`[DEBUG PAYMENT] Order cannot be paid. Status: ${order.status}`);
      return res.status(400).json({ 
        error: `Pesanan tidak bisa dibayar. Status saat ini: ${getStatusText(order.status)}` 
      });
    }
    
    // Validasi jumlah pembayaran
    if (order.total !== parseInt(amount)) {
      console.log(`[DEBUG PAYMENT] Amount mismatch. Expected: ${order.total}, Got: ${amount}`);
      return res.status(400).json({ 
        error: 'Jumlah pembayaran tidak sesuai dengan total pesanan' 
      });
    }
    
    // Simpan ke tabel payment_proofs
    try {
      const [proofResult] = await db.promise().query(
        `INSERT INTO payment_proofs 
         (order_id, user_phone, filename, original_name, file_size, mime_type, file_path, payment_method, note) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          order_id, 
          userPhone, 
          req.file.filename, 
          req.file.originalname, 
          req.file.size, 
          req.file.mimetype, 
          req.file.path, 
          payment_method, 
          note
        ]
      );
      
      console.log(`[DEBUG PAYMENT] Payment proof saved with ID: ${proofResult.insertId}`);
    } catch (error) {
      console.error('[DEBUG PAYMENT] Error saving payment proof:', error);
      return res.status(500).json({ error: 'Gagal menyimpan bukti pembayaran' });
    }
    
    // Update order dengan bukti pembayaran
    try {
      await db.promise().query(
        `UPDATE orders SET 
         payment_method = ?, 
         payment_proof = ?, 
         payment_note = ?, 
         status = 'pending_verification',
         payment_date = NOW()
         WHERE id = ?`,
        [payment_method, req.file.filename, note, order_id]
      );
      
      console.log(`[DEBUG PAYMENT] Order ${order_id} updated to pending_verification`);
    } catch (error) {
      console.error('[DEBUG PAYMENT] Error updating order:', error);
      return res.status(500).json({ error: 'Gagal memperbarui status pesanan' });
    }
    
    // Kirim notifikasi ke admin
    try {
      await sendAdminNotification(order_id);
      console.log(`[DEBUG PAYMENT] Admin notification sent for order ${order_id}`);
    } catch (error) {
      console.error('[DEBUG PAYMENT] Error sending admin notification:', error);
      // Lanjutkan meskipun notifikasi gagal
    }
    
    res.status(200).json({ 
      success: true, 
      message: 'Bukti pembayaran berhasil diupload' 
    });
    
  } catch (error) {
    console.error('[DEBUG PAYMENT] Upload payment proof error:', error);
    res.status(500).json({ error: 'Gagal mengupload bukti pembayaran' });
  }
});

// Fungsi helper untuk mendapatkan teks status
function getStatusText(status) {
  const statusMap = {
    'pending': 'Menunggu Pembayaran',
    'pending_verification': 'Menunggu Verifikasi',
    'processing': 'Sedang Diproses',
    'ready': 'Siap Dikirim',
    'delivered': 'Terkirim',
    'cancelled': 'Dibatalkan'
  };
  return statusMap[status] || status;
}

// Fungsi untuk mengirim notifikasi ke admin
async function sendAdminNotification(orderId) {
  try {
    // Implementasi notifikasi ke admin (WhatsApp, email, dll)
    console.log(`[DEBUG NOTIFICATION] Sending admin notification for order ${orderId}`);
    
    // Contoh: Simpan ke tabel notifications
    await db.promise().query(
      'INSERT INTO notifications (user_phone, title, message, type, related_type, related_id) VALUES (?, ?, ?, ?, ?, ?)',
      [
        null, // NULL untuk notifikasi admin
        'Bukti Pembayaran Baru',
        `Pesanan #${orderId} menunggu verifikasi pembayaran`,
        'info',
        'order',
        orderId
      ]
    );
  } catch (error) {
    console.error('[DEBUG NOTIFICATION] Error sending admin notification:', error);
  }
}
// Endpoint untuk admin melihat pesanan yang menunggu verifikasi
app.get('/api/admin/pending-verifications', authenticateToken, async (req, res) => {
  try {
    const [orders] = await db.promise().query(`
      SELECT o.*, c.name as customer_name, c.phone as customer_phone
      FROM orders o
      JOIN customers c ON o.user_phone = c.phone
      WHERE o.status = 'pending_verification'
      ORDER BY o.payment_date DESC
    `);
    
    res.json(orders);
  } catch (error) {
    console.error('Error fetching pending verifications:', error);
    res.status(500).json({ error: 'Gagal memuat data verifikasi' });
  }
});

// Endpoint untuk admin memverifikasi pembayaran
app.post('/api/admin/verify-payment/:orderId', authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, note } = req.body; // status: 'verified' atau 'rejected'
    const adminId = req.user.id;
    
    // Update order
    await db.promise().query(`
      UPDATE orders SET 
      status = ?,
      verified_by = ?,
      verified_at = NOW(),
      verification_note = ?
      WHERE id = ?
    `, [status, adminId, note, orderId]);
    
    // Kirim notifikasi ke user
    await sendUserNotification(orderId, status, note);
    
    res.json({ success: true, message: 'Pembayaran berhasil diverifikasi' });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: 'Gagal memverifikasi pembayaran' });
  }
});

//statistik
const adminRouter = express.Router();
adminRouter.use(authenticateAdmin); // Proteksi semua rute di bawah ini

// 1. Endpoint Statistik Utama (Card)
adminRouter.get('/statistics', async (req, res) => {
  try {
    const dbPromise = db.promise();
    
    // Total Penjualan (Hanya yang sudah 'delivered')
    const [sales] = await dbPromise.query(
      "SELECT SUM(total) as totalSales, COUNT(id) as totalOrders FROM orders WHERE status = 'delivered'"
    );
    
    // Total User
    const [users] = await dbPromise.query("SELECT COUNT(id) as totalUsers FROM users");
    
    // Menu Paling Laris
    const [topItem] = await dbPromise.query(`
      SELECT oi.name, SUM(oi.quantity) as totalSold
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status = 'delivered'
      GROUP BY oi.name
      ORDER BY totalSold DESC
      LIMIT 1
    `);

    res.json({
      totalSales: sales[0].totalSales || 0,
      totalOrders: sales[0].totalOrders || 0,
      totalUsers: users[0].totalUsers || 0,
      topItem: topItem[0] || { name: '-', totalSold: 0 }
    });
  } catch (error) {
    console.error('[ADMIN STATS] ❌ Error:', error);
    res.status(500).json({ error: 'Gagal memuat statistik.' });
  }
});

// 2. Endpoint Data Chart Penjualan (Filter Harian/Mingguan/Bulanan)
adminRouter.get('/sales-chart', async (req, res) => {
  const { period } = req.query; // 'daily', 'weekly', 'monthly'
  let groupBy = '';
  let whereClause = '';

  try {
    switch (period) {
      case 'daily':
        groupBy = 'DATE(created_at)';
        // Ambil 7 hari terakhir
        whereClause = 'WHERE created_at >= CURDATE() - INTERVAL 7 DAY';
        break;
      case 'weekly':
        groupBy = 'YEARWEEK(created_at)';
        // Ambil 12 minggu terakhir
        whereClause = 'WHERE created_at >= CURDATE() - INTERVAL 12 WEEK';
        break;
      case 'monthly':
      default:
        groupBy = "DATE_FORMAT(created_at, '%Y-%m')";
        // Ambil 12 bulan terakhir
        whereClause = 'WHERE created_at >= CURDATE() - INTERVAL 12 MONTH';
        break;
    }

    const [chartData] = await db.promise().query(`
      SELECT 
        ${groupBy} as period,
        SUM(total) as sales
      FROM orders
      ${whereClause} AND status = 'delivered'
      GROUP BY period
      ORDER BY period ASC
    `);
    
    res.json(chartData.map(d => ({
      period: String(d.period), // Pastikan string
      sales: parseFloat(d.sales)
    })));

  } catch (error) {
    console.error('[ADMIN CHART] ❌ Error:', error);
    res.status(500).json({ error: 'Gagal memuat data chart.' });
  }
});

// 3. Endpoint Top Selling Items (List)
adminRouter.get('/top-items', async (req, res) => {
  try {
    const [items] = await db.promise().query(`
      SELECT oi.name, m.image_url, SUM(oi.quantity) as totalSold, SUM(oi.price * oi.quantity) as totalRevenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN menu m ON oi.item_id = m.id
      WHERE o.status = 'delivered'
      GROUP BY oi.name, m.image_url
      ORDER BY totalSold DESC
      LIMIT 10
    `);
    res.json(items);
  } catch (error) {
    console.error('[ADMIN TOP ITEMS] ❌ Error:', error);
    res.status(500).json({ error: 'Gagal memuat top items.' });
  }
});

// 4. Endpoint User Management (Cari & List)
adminRouter.get('/users', async (req, res) => {
  const { search } = req.query;
  try {
    let query = 'SELECT phone, name, email, created_at, is_profile_complete FROM users';
    const params = [];

    if (search) {
      query += ' WHERE name LIKE ? OR phone LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }
    
    query += ' ORDER BY created_at DESC LIMIT 50'; // Paginasi sederhana
    
    const [users] = await db.promise().query(query, params);
    res.json(users);
  } catch (error) {
    console.error('[ADMIN USERS] ❌ Error:', error);
    res.status(500).json({ error: 'Gagal memuat data user.' });
  }
});

// 5. Endpoint Hapus User
adminRouter.delete('/users/:phone', async (req, res) => {
  const { phone } = req.params;
  const dbPromise = db.promise();
  
  try {
    await dbPromise.beginTransaction();
    
    // Hapus data yang berelasi dengan user
    // PENTING: Menghapus user juga akan menghapus data sensitif.
    // Opsi 1: Hapus semua data (termasuk order) - BERBAHAYA UNTUK REKAP
    // Opsi 2: Hapus data non-penting (alamat, cart) dan biarkan order.
    
    // Kita coba hapus data non-order
    await dbPromise.query('DELETE FROM addresses WHERE user_phone = ?', [phone]);
    
    // Hapus cart (jika ada)
    const [cart] = await dbPromise.query('SELECT id FROM carts WHERE user_phone = ?', [phone]);
    if (cart.length > 0) {
      await dbPromise.query('DELETE FROM cart_items WHERE cart_id = ?', [cart[0].id]);
      await dbPromise.query('DELETE FROM carts WHERE id = ?', [cart[0].id]);
    }
    
    // Hapus OTP codes
    await dbPromise.query('DELETE FROM otp_codes WHERE phone = ?', [phone]);

    // Terakhir, hapus user
    const [result] = await dbPromise.query('DELETE FROM users WHERE phone = ?', [phone]);

    if (result.affectedRows === 0) {
      await dbPromise.rollback();
      return res.status(404).json({ error: 'User tidak ditemukan.' });
    }

    await dbPromise.commit();
    res.json({ success: true, message: 'User dan data terkait (kecuali order) berhasil dihapus.' });

  } catch (error) {
    await dbPromise.rollback();
    console.error('[ADMIN DELETE USER] ❌ Error:', error);
    
    // Cek jika error karena FK (Foreign Key) dari tabel orders
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.message.includes('FOREIGN KEY')) {
       return res.status(400).json({ error: 'Gagal hapus: User ini memiliki riwayat pesanan. Hapus pesanan user terlebih dahulu.' });
    }
    res.status(500).json({ error: 'Gagal menghapus user.' });
  }
});
// ===========================================
// 🚀 SERVER STARTUP
// ===========================================
app.use((error, req, res, next) => {
console.error('[ERROR HANDLER] Caught error:', error);

if (error instanceof multer.MulterError) {
// Error dari Multer (file size, etc)
return res.status(400).json({
error: `Upload error: ${error.message}`
});
} else if (error) {
// Error lainnya
return res.status(500).json({
error: error.message || 'Internal server error'
});
}
next();
});
app.use('/api/admin', adminRouter);
// Mount wilayah router before server start
app.use('/api/wilayah', wilRouter);

// Mount payment routes
app.use('/api/payments', paymentRoutes);

app.listen(PORT, () => {
console.log(`🔥 Server berjalan di http://localhost:${PORT}`);
});