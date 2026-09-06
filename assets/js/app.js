// ==========================================
// VARIABEL GLOBAL
// ==========================================
let chatHistory = [];
let customApiKey = localStorage.getItem('PALOPO_GEMINI_KEY') || '';
const GOOGLE_SHEET_API_URL = "https://script.google.com/macros/s/AKfycbzSqUXuTX-ArZbalkva_3zv8bGnsxihgXd-6Abt_GEyDSgGDo05c7htrVpDopxI2Tre/exec";
let sheetKnowledgeBase = [];
let isSpeaking = false;
let currentUtterance = null;
let idleTimer = null;
let ikmShownThisSession = false;
let isAccessibilityMode = localStorage.getItem('PALOPO_ACCESSIBILITY_MODE') === 'true';
const CHAT_STORAGE_KEY = 'PALOPO_CHAT_HISTORY_DATA';

// ==========================================
// FUNGSI UTAMA
// ==========================================

// Load Knowledge Base dari Google Sheets
async function loadKnowledgeBaseFromSheet() {
  try {
    const response = await fetch(GOOGLE_SHEET_API_URL);
    if (response.ok) {
      sheetKnowledgeBase = await response.json();
      console.log("Database Google Sheets berhasil dimuat:", sheetKnowledgeBase);
    }
  } catch (error) {
    console.warn("Gagal terhubung ke Google Sheets, menggunakan data internal code saja.", error);
  }
}

// Toggle Side Menu
function toggleSideMenu() {
  document.getElementById('side-drawer').classList.toggle('hidden');
}

// Tampilkan Halaman Beranda
function showHomeScreen() {
  document.getElementById('home-screen').classList.remove('hidden');
  document.getElementById('chat-screen').classList.add('hidden');
  document.getElementById('chat-screen').classList.remove('flex');
}

// Tampilkan Halaman Chat
function showChatScreen() {
  document.getElementById('home-screen').classList.add('hidden');
  document.getElementById('chat-screen').classList.remove('hidden');
  document.getElementById('chat-screen').classList.add('flex');
}

// Escape HTML untuk keamanan
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Minta izin dan simpan subscription
async function subscribePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('Browser tidak mendukung notifikasi push.');
    return;
  }
  
  try {
    const registration = await navigator.serviceWorker.ready;
    // VAPID public key (ganti dengan key Anda)
    const vapidPublicKey = 'BL6k...'; // nanti diganti
  
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidPublicKey
    });
  
    // Simpan subscription ke localStorage (atau kirim ke server)
    const subscriptions = JSON.parse(localStorage.getItem('PALOPO_PUSH_SUBSCRIPTIONS') || '[]');
    subscriptions.push(subscription);
    localStorage.setItem('PALOPO_PUSH_SUBSCRIPTIONS', JSON.stringify(subscriptions));
  
    alert('✅ Notifikasi diaktifkan!');
  } catch (e) {
    console.error('Gagal subscribe:', e);
    alert('Gagal mengaktifkan notifikasi: ' + e.message);
  }
}

// Tombol di menu atau footer untuk subscribe
// Tambahkan di side menu atau footer

// ==========================================
// FUNGSI CHAT
// ==========================================

// Kirim Pesan Chat
async function handleChatSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('user-input');
  const text = input.value.trim();
  if (!text) return;

  showChatScreen();
  appendUserMessage(text);
  input.value = '';

  const textLower = text.toLowerCase();

  if (textLower.includes("terima kasih") || textLower.includes("makasih") || textLower.includes("makkasora") || textLower.includes("thanks")) {
    setTimeout(() => {
      showIkmPopup();
    }, 1500);
  }

  startIdleTimer();
          
  const isEmergency = checkEmergencyTrigger(text);
  if (isEmergency) {
    return;
  }

  showAITypingIndicator();

  try {
    let aiResponseText = "";
    if (customApiKey) {
      aiResponseText = await callGeminiApi(text);
    } else {
      aiResponseText = await fallbackLLMEngine(text);
    }
    removeAITypingIndicator();
    appendAIMessage(aiResponseText);
  } catch (err) {
    removeAITypingIndicator();
    appendAIMessage("Mohon maaf, terjadi kendala koneksi ke server AI. Silakan coba beberapa saat lagi atau periksa API Key Anda.");
  }
}

// Kirim Prompt Cepat
function sendQuickPrompt(promptText) {
  document.getElementById('user-input').value = promptText;
  handleChatSubmit(new Event('submit'));
}

// Tampilkan Pesan User (dengan gaya inline)
function appendUserMessage(text) {
  const stream = document.getElementById('chat-stream');
  chatHistory.push({ role: "user", parts: [{ text: text }] });

  stream.insertAdjacentHTML('beforeend', `
    <div class="flex justify-end my-2">
      <div style="background-color: #0f3c5f; color: white; font-size: 0.75rem; padding: 0.75rem; border-radius: 1rem; border-top-right-radius: 0; max-width: 85%; box-shadow: 0 1px 2px rgba(0,0,0,0.05); line-height: 1.625;">
        ${escapeHtml(text)}
      </div>
    </div>
  `);
  stream.scrollTop = stream.scrollHeight;
  saveChatToLocalStorage();
}

// Tampilkan Pesan AI (dengan gaya inline penuh)
function appendAIMessage(markdownText) {
  const stream = document.getElementById('chat-stream');
  chatHistory.push({ role: "model", parts: [{ text: markdownText }] });

  const htmlContent = marked.parse(markdownText);
  const messageId = 'msg-' + Date.now();

  stream.insertAdjacentHTML('beforeend', `
    <div class="flex items-start space-x-2.5 my-2" id="${messageId}">
      <div style="width: 32px; height: 32px; border-radius: 9999px; background-color: #06b6d4; color: white; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; flex-shrink: 0; font-weight: 700; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">AI</div>
      <div style="background-color: white; border: 1px solid #e2e8f0; font-size: 0.75rem; padding: 0.75rem; border-radius: 1rem; border-top-left-radius: 0; max-width: 92%; color: #334155; box-shadow: 0 1px 2px rgba(0,0,0,0.05); line-height: 1.625;" class="chat-body">
        ${htmlContent}
        
        <!-- AREA FEEDBACK dengan teks -->
        <div class="flex items-center gap-3 mt-2.5 pt-2 border-t border-slate-200 text-xs text-slate-500">
          <span class="text-[10px] text-slate-400 font-medium">Apakah jawaban ini membantu?</span>
          <button onclick="sendFeedback('${messageId}', '👍')" class="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-emerald-50 transition text-emerald-600 hover:text-emerald-700 font-medium">
            <span>👍</span>
            <span class="text-[11px]">Membantu</span>
          </button>
          <button onclick="sendFeedback('${messageId}', '👎')" class="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-rose-50 transition text-rose-500 hover:text-rose-600 font-medium">
            <span>👎</span>
            <span class="text-[11px]">Tidak Membantu</span>
          </button>
          <span id="feedback-${messageId}" class="text-[10px] text-slate-400 ml-auto"></span>
        </div>
      </div>
    </div>
  `);
  stream.scrollTop = stream.scrollHeight;
  saveChatToLocalStorage();
}

function sendFeedback(messageId, type) {
  const feedbackSpan = document.getElementById(`feedback-${messageId}`);
  if (!feedbackSpan) return;
  
  // Cegah double feedback
  if (feedbackSpan.dataset.sent) return;
  
  // Ambil isi pesan AI
  const parentDiv = document.getElementById(messageId);
  const aiMessage = parentDiv.querySelector('.chat-body').innerText || 'Konten tidak terbaca';
  
  // Simpan ke localStorage
  const feedbacks = JSON.parse(localStorage.getItem('PALOPO_FEEDBACKS') || '[]');
  feedbacks.push({
    messageId,
    type,
    content: aiMessage.slice(0, 200),
    timestamp: new Date().toISOString()
  });
  localStorage.setItem('PALOPO_FEEDBACKS', JSON.stringify(feedbacks));
  
  feedbackSpan.textContent = type === '👍' ? '✅ Terima kasih!' : '🙏 Kami catat masukan Anda';
  feedbackSpan.dataset.sent = 'true';
  
  // Opsional: kirim ke Google Sheets
  sendFeedbackToSheet(aiMessage, type);
}

async function sendFeedbackToSheet(content, type) {
  try {
    const response = await fetch(GOOGLE_SHEET_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'feedback', content, type, timestamp: new Date().toISOString() })
    });
    console.log('Feedback terkirim ke Google Sheets');
  } catch (e) {
    console.warn('Gagal kirim feedback ke Google Sheets:', e);
  }
}

// Tampilkan Indikator Mengetik AI
function showAITypingIndicator() {
  const stream = document.getElementById('chat-stream');
  stream.insertAdjacentHTML('beforeend', `
    <div id="ai-typing" class="flex items-start space-x-2.5 my-2">
      <div class="w-8 h-8 rounded-full bg-brand-cyan text-white flex items-center justify-center text-xs shrink-0 font-bold shadow-sm">AI</div>
      <div class="bg-white border border-slate-200 text-xs p-3.5 rounded-2xl rounded-tl-none text-slate-500 shadow-sm flex items-center space-x-3">
        <span class="text-[11px] font-medium">Palopota AI sedang menyusun jawaban...</span>
        <div class="dot-flashing ml-2"></div>
      </div>
    </div>
  `);
  stream.scrollTop = stream.scrollHeight;
}

// Hapus Indikator Mengetik AI
function removeAITypingIndicator() {
  const el = document.getElementById('ai-typing');
  if (el) el.remove();
}

// Bersihkan Riwayat Chat
function clearChat() {
  chatHistory = [];
  localStorage.removeItem(CHAT_STORAGE_KEY);
  
  const stream = document.getElementById('chat-stream');
  stream.innerHTML = `
    <div class="flex items-start space-x-2.5 my-1">
      <div class="w-8 h-8 rounded-full bg-brand-navy text-white flex items-center justify-center text-xs shrink-0 font-bold shadow-sm">AI</div>
      <div class="bg-white border border-slate-200 text-xs p-3.5 rounded-2xl rounded-tl-none max-w-[88%] text-slate-700 shadow-sm">
        Riwayat percakapan telah dibersihkan. Silakan tanyakan informasi layanan publik lainnya!
      </div>
    </div>
  `;
}

// ==========================================
// API & FALLBACK ENGINE
// ==========================================

// Panggil Gemini API
async function callGeminiApi(prompt) {
  const systemInstruction = `Kamu adalah Palopota AI, asisten virtual resmi Pemerintah Kota Palopo, Sulawesi Selatan.
Tugas utama: Memberikan informasi akurat mengenai layanan publik, izin usaha (NIB), dokumen kependudukan (KTP, KK, Akta), bantuan sosial, dan direktori OPD Kota Palopo.
Gaya Bahasa: Ramah, sopan, komunikatif, dan responsif. Boleh menyapa dengan salam lokal khas Luwu/Palopo (seperti "Salama'ki tapada salama" atau "Tabe'").
Format Jawaban: Gunakan poin-poin bertingkat, format bold untuk penekanan, serta sertakan persyaratan, biaya (mayoritas Gratis/Rp 0), dan lokasi dinas terkait jika relevan.`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${customApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: chatHistory,
      systemInstruction: { parts: [{ text: systemInstruction }] }
    })
  });

  const data = await response.json();
  if (data.candidates && data.candidates[0].content.parts[0].text) {
    return data.candidates[0].content.parts[0].text;
  } else {
    throw new Error("Invalid API Response");
  }
}

// Fallback Engine (tanpa API Key)
async function fallbackLLMEngine(prompt) {
  await new Promise(r => setTimeout(r, 1200));
  const text = prompt.toLowerCase();

  // Cek dari Google Sheets terlebih dahulu
  if (sheetKnowledgeBase && sheetKnowledgeBase.length > 0) {
    for (let item of sheetKnowledgeBase) {
      if (item.keyword && text.includes(item.keyword)) {
        return item.response;
      }
    }
  }

  // DOKUMEN KEPENDUDUKAN & KARTU
  if (text.includes("ktp") || text.includes("identitas")) {
    return "**Persyaratan Pengurusan KTP-el (Disdukcapil Palopo):**\n\n" +
           "* **KTP Rusak/Patah:** Bawa fisik KTP lama + Fotokopi Kartu Keluarga (KK).\n" +
           "* **KTP Hilang:** Surat Keterangan Hilang dari Kepolisian + Fotokopi KK.\n" +
           "* **Pemula (17 Tahun):** Cukup membawa Fotokopi KK untuk rekam foto/sidik jari.\n\n" +
           "💰 **Biaya:** Gratis (Rp 0)\n📍 **Lokasi:** Kantor Disdukcapil Kota Palopo, Jl. Landak No. 1.";
  } else if (text.includes("nib") || text.includes("umkm") || text.includes("izin usaha")) {
    return "**Pembuatan NIB (Nomor Induk Berusaha) UMKM:**\n\n" +
           "1. **Syarat:** NIK KTP, Nomor WhatsApp aktif, dan Email aktif.\n" +
           "2. **Prosedur:** Diproses melalui sistem OSS (Online Single Submission).\n" +
           "3. **Waktu Selesai:** ~10-15 Menit Instan.\n\n" +
           "💰 **Biaya:** Gratis (Rp 0)\n📍 **Bantuan Pendampingan:** DPMPTSP Kota Palopo, Jl. Durian No. 5.";
  } else if (text.includes("pkh") || text.includes("bansos") || text.includes("dtks")) {
    return "**Pendaftaran Bansos PKH / Usulan DTKS:**\n\n" +
           "* **Syarat:** Fotokopi KTP & Kartu Keluarga (KK).\n" +
           "* **Alur:** Pengusulan nama melalui Musyawarah Kelurahan (Muskel) setempat, dilanjutkan verifikasi lapangan oleh petugas Dinas Sosial.\n\n" +
           "📍 **Pusat Informasi:** Dinas Sosial Kota Palopo, Jl. Andi Djemma No. 10.";
  } else if (text.includes("beasiswa") || text.includes("sekolah")) {
    return "**Beasiswa Palopo Pintar (Dinas Pendidikan):**\n\n" +
           "* **Persyaratan:** KTP/KK Palopo, Surat Keterangan Aktif Sekolah/Kuliah, dan SKTM dari Kelurahan atau Sertifikat Prestasi.\n\n" +
           "📍 **Lokasi:** Dinas Pendidikan Kota Palopo, Jl. Ahmad Yani No. 25.";
  
  // LAYANAN PENGADUAN & PAJAK
  } else if (text.includes("lapor") || text.includes("melapor") || text.includes("pengaduan") || text.includes("oke sappo")) {
    return "**📢 Layanan Pengaduan Masyarakat (Oke Sappo!)**\n\n" +
           "Anda dapat menyampaikan laporan, keluhan, maupun aspirasi terkait pelayanan publik di Kota Palopo secara langsung melalui **OKE SAPPO!** yang dikelola oleh **Diskominfo SP Kota Palopo**.\n\n" +
           "Silakan klik tombol di bawah ini untuk terhubung langsung dengan Admin Pengaduan via WhatsApp:\n\n" +
           "<div class='pt-2 pb-1'><a href='https://wa.me/6285165478686?text=HALO%20ADMIN%20OKE%20SAPPO!,%20Saya%20ingin%20menyampaikan%20laporan/pengaduan.' target='_blank' class='inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-xl text-xs shadow transition'><i class='fa-brands fa-whatsapp text-sm'></i><span>Lapor via OKE SAPPO! (WhatsApp)</span></a></div>";
  } else if (text.includes("pajak") || text.includes("bayar pajak") || text.includes("aksara") || text.includes("smart tax") || text.includes("pbb")) {
    return "**💳 Layanan Pembayaran Pajak Daerah (AKSARA SMART TAX)**\n\n" +
           "Untuk kemudahan pembayaran Pajak Daerah (PBB-P2, Pajak Restoran, Reklame, dll.), Anda dapat mengakses aplikasi resmi **AKSARA SMART TAX** yang dikelola oleh **BAPENDA Kota Palopo**.\n\n" +
           "Silakan klik tombol di bawah ini untuk membuka portal/aplikasi pembayaran pajak:\n\n" +
           "<div class='pt-2 pb-1'><a href='https://pajakdaerah.palopokota.go.id' target='_blank' class='inline-flex items-center space-x-2 bg-brand-navy hover:bg-slate-800 text-white font-bold py-2 px-3 rounded-xl text-xs shadow transition'><i class='fa-solid fa-credit-card text-sm'></i><span>Buka AKSARA SMART TAX</span></a></div>";

  // INFORMASI HARGA PANGAN & SEMBAKO
  } else if (text.includes("harga pangan") || text.includes("harga sembako") || text.includes("harga telur") || text.includes("harga beras") || text.includes("harga cabai")) {
    return "**📊 Daftar Informasi Harga Pangan & Sembako Kota Palopo**\n\n" +
           "*Berikut adalah data perkiraan harga rata-rata 25 komoditas pangan utama di Pasar Sentral & Pasar Andi Tadda Palopo:*\n\n" +
           "1. **Beras Medium:** Rp 13.500 / kg\n" +
           "2. **Beras Premium:** Rp 15.000 / kg\n" +
           "3. **Gula Pasir:** Rp 18.000 / kg\n" +
           "4. **Minyak Goreng Kita (Kemasan):** Rp 16.000 / liter\n" +
           "5. **Minyak Goreng Curah:** Rp 15.500 / liter\n" +
           "6. **Daging Sapi Segar:** Rp 130.000 / kg\n" +
           "7. **Daging Ayam Ras:** Rp 32.000 / kg\n" +
           "8. **Daging Ayam Kampung:** Rp 65.000 / ekor\n" +
           "9. **Telur Ayam Ras:** Rp 52.000 / rak (Rp 2.000 / butir)\n" +
           "10. **Telur Ayam Kampung:** Rp 2.500 / butir\n" +
           "11. **Cabai Merah Keriting:** Rp 35.000 / kg\n" +
           "12. **Cabai Rawit Merah:** Rp 45.000 / kg\n" +
           "13. **Bawang Merah:** Rp 30.000 / kg\n" +
           "14. **Bawang Putih:** Rp 40.000 / kg\n" +
           "15. **Tepung Terigu:** Rp 11.000 / kg\n" +
           "16. **Tahu Putih:** Rp 5.000 / bungkus\n" +
           "17. **Tempe:** Rp 5.000 / papan\n" +
           "18. **Ikan Bandeng (Bolu):** Rp 25.000 / kg\n" +
           "19. **Ikan Tongkol:** Rp 30.000 / kg\n" +
           "20. **Udang Vaname:** Rp 60.000 / kg\n" +
           "21. **Tomat Buah:** Rp 10.000 / kg\n" +
           "22. **Kentang:** Rp 18.000 / kg\n" +
           "23. **Wortel:** Rp 12.000 / kg\n" +
           "24. **Sagu Basah (Manta'):** Rp 15.000 / tumpi\n" +
           "25. **Gula Merah / Aren:** Rp 22.000 / kg\n\n" +
           "📍 *Sumber Data: Pemantauan Dinas Koperasi, Perdagangan, dan Perindustrian (DISKOPDAGRIN) Kota Palopo.*";

  // PROFIL, SEJARAH, WISATA & PEMERINTAHAN KOTA PALOPO
  } else if (text.includes("profil palopo") || text.includes("tentang palopo") || text.includes("dimana kota palopo")) {
    return "🌆 **Profil Singkat Kota Palopo:**\n\n" +
           "Palopo adalah kota otonom di Sulawesi Selatan yang dikenal sebagai pusat sejarah Kedatuan Luwu serta berkembang pesat sebagai kota jasa, perdagangan, dan pendidikan di kawasan Luwu Raya.";
  } else if (text.includes("hari jadi kota palopo") || text.includes("ulang tahun palopo") || text.includes("hut palopo")) {
    return "🎉 **Hari Jadi Kota Palopo** diperingati setiap tanggal **2 Juli**.\n\n" +
           "Kota Palopo resmi terbentuk sebagai daerah otonom berdasarkan Undang-Undang Nomor 11 Tahun 2002.";
  } else if (text.includes("kantor wali kota") || text.includes("kantor walikota") || text.includes("pemerintahan")) {
    return "🏛️ **Pemerintahan Kota Palopo** berpusat di Balai Kota Palopo (Jl. Andi Djemma).\n\n" +
           "Informasi resmi terkait jajaran pimpinan dan struktur organisasi daerah dapat diakses melalui portal resmi Pemkot Palopo (palopokota.go.id).";
  } else if (text.includes("wisata") || text.includes("destinasi") || text.includes("liburan") || text.includes("jalan-jalan")) {
    return "🌴 **Destinasi Wisata Unggulan Kota Palopo:**\n\n" +
           "• **Wisata Sejarah & Budaya:** Istana Datu Luwu, Masjid Jami Tua Palopo\n" +
           "• **Wisata Alam & Rekreasi:** Permandian Alam Latuppa, Kambo Highland (Bukit Kambo), Pantai Labombo, Gua Kancing\n" +
           "• **Kuliner:** Pusat Kuliner Lagota (Kapurung, Dange, Pacco)";

  // SAPAAN, SALAM, PERKENALAN
  } else if (text.includes("assalamualaikum") || text.includes("salam")) {
    return "Wa'alaikumsalam Warahmatullahi Wabarakatuh! 🌿\n\n" +
           "Selamat datang di Layanan **Palopota AI**. Saya siap membantu Anda seputar pengurusan dokumen, izin UMKM, atau informasi layanan publik Kota Palopo. Ada yang bisa saya bantu hari ini?";
  } else if (text.includes("halo") || text.includes("hai") || text.includes("hello")) {
    return "Halo! 👋 Selamat datang di **Palopota AI**.\n\n" +
           "Saya asisten digital resmi Kota Palopo. Silakan tanyakan syarat pembuatan KTP, KK, Akta Kelahiran, NIB UMKM, Beasiswa, Bansos, atau layanan OPD lainnya!";
  } else if (text.includes("tabe") || text.includes("salama")) {
    return "Salama’ki tapada salama! Tabe', aga kaperluangta ri layanan **Palopota AI** hari ini?\n\n" +
           "Saya siap membantu pengurusan berkas kependudukan, perizinan, dan informasi layanan publik di Kota Palopo.";
  } else if (text.includes("terima kasih") || text.includes("makasih") || text.includes("thanks") || text.includes("makkasora")) {
    return "Sama-sama! 😊 Senang sekali bisa membantu Anda.\n\n" +
           "Jika masih ada dokumen atau layanan publik Kota Palopo yang ingin ditanyakan, jangan ragu untuk menyapa saya kembali. Palopota AI selalu siap 24/7 untuk Anda!";
  } else if (text.includes("siapa kamu") || text.includes("perkenalan") || text.includes("tentang aplikasi")) {
    return "Saya adalah **Palopota AI**, asisten digital resmi Pemerintah Kota Palopo. 🤖\n\n" +
           "Saya dirancang untuk memberikan informasi cepat, akurat, dan transparan terkait syarat dokumen, alur perizinan, fasilitas kesehatan, serta lokasi kantor dinas di Kota Palopo.";
  } else {
    return `Terima kasih atas pertanyaan Anda mengenai **"${escapeHtml(prompt)}"**.\n\n` +
           `Sebagai Asisten AI Kota Palopo, saya dapat membimbing Anda mengenai:\n` +
           `* **Disdukcapil:** KTP-el, KK, Akta Lahir/Kematian, Surat Pindah.\n` +
           `* **DPMPTSP:** NIB UMKM, Sertifikat Halal, PBG Bangunan.\n` +
           `* **Dinas Sosial:** DTKS, PKH, BPNT, SKTM.\n\n`;
  }
}

// ==========================================
// FITUR MODAL
// ==========================================

// Buka Modal Fitur
function openFeatureModal(type) {
  const modal = document.getElementById('feature-modal');
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');
  modal.classList.remove('hidden');

  if (type === 'LIFE_EVENT') {
    title.innerText = "Life Event Mode (Layanan Terpadu)";
    body.innerHTML = `
      <div class="space-y-2.5">
        <div class="p-3 border rounded-2xl bg-rose-50/70 border-rose-200">
          <div class="font-bold text-rose-900 text-xs mb-1">👶 Melahirkan & Kelahiran Bayi</div>
          <p class="text-[11px] text-slate-600 mb-2">Integrasi Akta Kelahiran Disdukcapil + Posyandu Dinkes + BPJS Kesehatan.</p>
          <button onclick="askAI('Syarat pengurusan akta kelahiran dan BPJS bayi baru lahir')" class="text-[10px] bg-rose-600 text-white px-2.5 py-1 rounded-lg font-bold">Tanya Syarat</button>
        </div>
        <div class="p-3 border rounded-2xl bg-emerald-50/70 border-emerald-200">
          <div class="font-bold text-emerald-900 text-xs mb-1">🏪 Membuka Usaha / UMKM Baru</div>
          <p class="text-[11px] text-slate-600 mb-2">Integrasi NIB DPMPTSP + Sertifikat Halal + PIRT Kesehatan + Bantuan Modal Diskopdagrin.</p>
          <button onclick="askAI('Bagaimana cara buat NIB UMKM dan Sertifikat Halal?')" class="text-[10px] bg-emerald-600 text-white px-2.5 py-1 rounded-lg font-bold">Tanya Syarat</button>
        </div>
        <div class="p-3 border rounded-2xl bg-pink-50/70 border-pink-200">
          <div class="font-bold text-pink-900 text-xs mb-1">💍 Pernikahan & Pembentukan KK Baru</div>
          <p class="text-[11px] text-slate-600 mb-2">Pemisahan Kartu Keluarga (KK) Disdukcapil + Update Status KTP Pasutri.</p>
          <button onclick="askAI('Syarat buat KK baru setelah menikah dan update KTP')" class="text-[10px] bg-pink-600 text-white px-2.5 py-1 rounded-lg font-bold">Tanya Syarat</button>
        </div>
        <div class="p-3 border rounded-2xl bg-sky-50/70 border-sky-200">
          <div class="font-bold text-sky-900 text-xs mb-1">🏡 Pindah Domisili ke Palopo</div>
          <p class="text-[11px] text-slate-600 mb-2">SKPWNI Disdukcapil + Pembaruan KK/KTP + Mutasi BPJS Kesehatan Faskes.</p>
          <button onclick="askAI('Prosedur dan syarat pindah domisili masuk ke Kota Palopo')" class="text-[10px] bg-sky-600 text-white px-2.5 py-1 rounded-lg font-bold">Tanya Syarat</button>
        </div>
        <div class="p-3 border rounded-2xl bg-amber-50/70 border-amber-200">
          <div class="font-bold text-amber-900 text-xs mb-1">🎓 Masuk Sekolah & Beasiswa</div>
          <p class="text-[11px] text-slate-600 mb-2">Pendaftaran PPDB Dinas Pendidikan + Pengurusan Beasiswa Palopo Pintar & SKTM Kelurahan.</p>
          <button onclick="askAI('Syarat daftar Beasiswa Palopo Pintar dan SKTM')" class="text-[10px] bg-amber-600 text-white px-2.5 py-1 rounded-lg font-bold">Tanya Syarat</button>
        </div>
        <div class="p-3 border rounded-2xl bg-indigo-50/70 border-indigo-200">
          <div class="font-bold text-indigo-900 text-xs mb-1">💼 Mencari Kerja & Pelatihan Kerja</div>
          <p class="text-[11px] text-slate-600 mb-2">Pembuatan Kartu Kuning (AK-1) Dinsosnakertrans + Pendaftaran Pelatihan Kerja BLK.</p>
          <button onclick="askAI('Syarat membuat Kartu Kuning AK1 melamar kerja')" class="text-[10px] bg-indigo-600 text-white px-2.5 py-1 rounded-lg font-bold">Tanya Syarat</button>
        </div>
        <div class="p-3 border rounded-2xl bg-teal-50/70 border-teal-200">
          <div class="font-bold text-teal-900 text-xs mb-1">🤲 Pengusulan Bantuan Sosial (Bansos)</div>
          <p class="text-[11px] text-slate-600 mb-2">Pengusulan Masuk DTKS Dinas Sosial + Pendaftaran PKH/BPNT + PBI BPJS Gratis.</p>
          <button onclick="askAI('Cara daftar DTKS dan Bansos PKH di Palopo')" class="text-[10px] bg-teal-600 text-white px-2.5 py-1 rounded-lg font-bold">Tanya Syarat</button>
        </div>
        <div class="p-3 border rounded-2xl bg-orange-50/70 border-orange-200">
          <div class="font-bold text-orange-900 text-xs mb-1">🏗️ Pembangunan & Perizinan Rumah</div>
          <p class="text-[11px] text-slate-600 mb-2">Penerbitan Persetujuan Bangunan Gedung (PBG/IMB) PUPR/DPMPTSP + Kesesuaian Tata Ruang (KKPR).</p>
          <button onclick="askAI('Syarat mengurus PBG atau IMB bangunan rumah')" class="text-[10px] bg-orange-600 text-white px-2.5 py-1 rounded-lg font-bold">Tanya Syarat</button>
        </div>
        <div class="p-3 border rounded-2xl bg-purple-50/70 border-purple-200">
          <div class="font-bold text-purple-900 text-xs mb-1">📄 Pengurusan Dokumen Hilang / Rusak</div>
          <p class="text-[11px] text-slate-600 mb-2">Cetak ulang KTP/KK/Akta Hilang (Surat Kehilangan Kepolisian + Disdukcapil).</p>
          <button onclick="askAI('Syarat cetak ulang KTP dan KK yang hilang atau rusak')" class="text-[10px] bg-purple-600 text-white px-2.5 py-1 rounded-lg font-bold">Tanya Syarat</button>
        </div>
        <div class="p-3 border rounded-2xl bg-slate-100 border-slate-300">
          <div class="font-bold text-slate-800 text-xs mb-1">🕊️ Kematian & Ahli Waris</div>
          <p class="text-[11px] text-slate-600 mb-2">Penerbitan Akta Kematian Disdukcapil + Perubahan Status KK + Santunan Duka / Ahli Waris.</p>
          <button onclick="askAI('Syarat pengurusan Akta Kematian dan KK baru')" class="text-[10px] bg-slate-700 text-white px-2.5 py-1 rounded-lg font-bold">Tanya Syarat</button>
        </div>
      </div>
    `;
  } else if (type === 'EMERGENCY') {
    title.innerText = "Layanan Cepat Darurat Kota Palopo";
    body.innerHTML = `
      <div class="space-y-3">
        <div class="p-3 bg-rose-100 border border-rose-300 rounded-2xl space-y-1">
          <div class="font-extrabold text-rose-900 text-xs flex items-center justify-between">
            <span class="flex items-center"><i class="fa-solid fa-phone-volume text-rose-600 mr-1.5 animate-pulse"></i> Panggilan Darurat Tunggal</span>
            <span class="bg-rose-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">112</span>
          </div>
          <p class="text-[11px] text-slate-600">Layanan bebas pulsa siaga darurat Kota Palopo.</p>
          <a href="tel:112" class="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center space-x-1.5 shadow mt-1">
            <i class="fa-solid fa-phone"></i><span>Telepon 112 (Bebas Pulsa)</span>
          </a>
        </div>

        <div class="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5">
          <div class="font-extrabold text-brand-navy text-xs flex items-center">
            <i class="fa-solid fa-shield-halved text-blue-600 mr-1.5"></i> Kepolisian (Polres Palopo)
          </div>
          <p class="text-[10px] text-slate-500"><i class="fa-solid fa-location-dot mr-1"></i>Jl. Opu Tosappaile No.9, Wara, Palopo</p>
          <div class="flex gap-2 pt-1">
            <a href="tel:110" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 rounded-lg text-[11px] flex items-center justify-center space-x-1">
              <i class="fa-solid fa-phone"></i><span>Call 110</span>
            </a>
            <a href="https://wa.me/6281218902002" target="_blank" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 rounded-lg text-[11px] flex items-center justify-center space-x-1">
              <i class="fa-brands fa-whatsapp"></i><span>Hotline WA</span>
            </a>
          </div>
        </div>

        <div class="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5">
          <div class="font-extrabold text-brand-navy text-xs flex items-center">
            <i class="fa-solid fa-fire-extinguisher text-rose-600 mr-1.5"></i> Pemadam Kebakaran
          </div>
          <p class="text-[10px] text-slate-500"><i class="fa-solid fa-location-dot mr-1"></i>Jl. Pongsimpin No.1, Wara, Palopo</p>
          <div class="flex gap-2 pt-1">
            <a href="tel:047122501" class="flex-1 bg-brand-navy hover:bg-slate-800 text-white font-bold py-1.5 rounded-lg text-[11px] flex items-center justify-center space-x-1">
              <i class="fa-solid fa-phone"></i><span>(0471) 22501</span>
            </a>
            <a href="https://wa.me/6285341341565" target="_blank" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 rounded-lg text-[11px] flex items-center justify-center space-x-1">
              <i class="fa-brands fa-whatsapp"></i><span>WhatsApp</span>
            </a>
          </div>
        </div>
      </div>
    `;
  } else if (type === 'OPD') {
    title.innerText = "Direktori OPD Kota Palopo";
    let html = '<div class="space-y-3">';
    opdData.forEach(opd => {
      let servicesList = opd.services.map(s => `<li class="flex items-center space-x-1"><span class="text-brand-blue font-bold">•</span> <span>${s}</span></li>`).join('');
      html += `
        <div class="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
          <div class="flex items-center justify-between border-b border-slate-200/60 pb-1.5">
            <strong class="text-xs font-extrabold text-brand-navy flex items-center">
              <i class="fa-solid fa-building-columns text-emerald-500 mr-1.5"></i> ${opd.name}
            </strong>
            <button onclick="askAI('Layanan ${opd.name}')" class="text-[10px] bg-brand-blue hover:bg-slate-800 text-white px-2.5 py-1 rounded-lg font-bold shrink-0 transition">
              Tanya AI
            </button>
          </div>
          <div class="text-[11px] text-slate-700">
            <span class="font-bold text-slate-500 block mb-1">Daftar Layanan:</span>
            <ul class="grid grid-cols-1 sm:grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-slate-600 pl-1">
              ${servicesList}
            </ul>
          </div>
          <div class="pt-1 text-[10px] text-slate-400 flex items-center">
            <i class="fa-solid fa-location-dot mr-1 text-slate-400"></i> ${opd.address}
          </div>
        </div>
      `;
    });
    html += '</div>';
    body.innerHTML = html;
  } else if (type === 'GIS' || type === 'FASKES') {
    title.innerText = "Peta GIS & Lokasi Pelayanan Kota Palopo";
    let html = `
      <div class="flex space-x-1 overflow-x-auto pb-2 custom-scroll mb-2 text-[11px]">
        <button onclick="renderGisList('Semua')" id="tab-Semua" class="gis-tab bg-brand-navy text-white px-3 py-1 rounded-full font-bold whitespace-nowrap">Semua</button>
        <button onclick="renderGisList('Fasum')" id="tab-Fasum" class="gis-tab bg-slate-100 text-slate-700 px-3 py-1 rounded-full font-bold whitespace-nowrap">🏛️ Fasum</button>
        <button onclick="renderGisList('OPD')" id="tab-OPD" class="gis-tab bg-slate-100 text-slate-700 px-3 py-1 rounded-full font-bold whitespace-nowrap">🏢 OPD</button>
        <button onclick="renderGisList('Kecamatan')" id="tab-Kecamatan" class="gis-tab bg-slate-100 text-slate-700 px-3 py-1 rounded-full font-bold whitespace-nowrap">📍 Kecamatan</button>
        <button onclick="renderGisList('Faskes')" id="tab-Faskes" class="gis-tab bg-slate-100 text-slate-700 px-3 py-1 rounded-full font-bold whitespace-nowrap">🏥 Faskes</button>
      </div>
      <div id="gis-list-container" class="space-y-2"></div>
    `;
    body.innerHTML = html;
    renderGisList('Semua');
  }
}

// Tutup Modal Fitur
function closeFeatureModal() {
  document.getElementById('feature-modal').classList.add('hidden');
}

// Tanya AI dari Modal
function askAI(promptText) {
  closeFeatureModal();
  document.getElementById('user-input').value = promptText;
  handleChatSubmit(new Event('submit'));
}

// Render GIS List
function renderGisList(filterCategory) {
  const container = document.getElementById('gis-list-container');
  if (!container) return;

  document.querySelectorAll('.gis-tab').forEach(btn => {
    btn.classList.remove('bg-brand-navy', 'text-white');
    btn.classList.add('bg-slate-100', 'text-slate-700');
  });
  const activeTab = document.getElementById(`tab-${filterCategory}`);
  if (activeTab) {
    activeTab.classList.remove('bg-slate-100', 'text-slate-700');
    activeTab.classList.add('bg-brand-navy', 'text-white');
  }

  const filtered = filterCategory === 'Semua' 
    ? gisData 
    : gisData.filter(item => item.category === filterCategory);

  let html = '';
  filtered.forEach(item => {
    let icon = 'fa-location-dot';
    let iconColor = 'text-indigo-500';
    if (item.category === 'Fasum') { icon = 'fa-landmark'; iconColor = 'text-amber-500'; }
    else if (item.category === 'OPD') { icon = 'fa-building'; iconColor = 'text-emerald-500'; }
    else if (item.category === 'Kecamatan') { icon = 'fa-map'; iconColor = 'text-sky-500'; }
    else if (item.category === 'Faskes') { icon = 'fa-hospital'; iconColor = 'text-rose-500'; }

    html += `
      <div class="p-2.5 border border-slate-200 rounded-xl bg-slate-50 flex items-center justify-between">
        <div>
          <strong class="text-xs text-slate-800 flex items-center">
            <i class="fa-solid ${icon} ${iconColor} mr-1.5"></i> ${item.name}
          </strong>
          <p class="text-[10px] text-slate-500 mt-0.5">${item.address}</p>
        </div>
        <div class="flex space-x-1 shrink-0">
          <a href="${item.mapsUrl}" target="_blank" class="text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-1 rounded-lg font-bold flex items-center hover:bg-indigo-100">
            <i class="fa-solid fa-diamond-turn-right mr-1"></i> Peta
          </a>
          <button onclick="askAI('Info lokasi dan layanan ${item.name}')" class="text-[10px] bg-brand-blue text-white px-2 py-1 rounded-lg font-bold">
            Tanya
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ==========================================
// FITUR DARURAT
// ==========================================

function checkEmergencyTrigger(inputText) {
  const text = inputText.toLowerCase();

  if (text.includes("telpon damkar") || text.includes("telpon pemadam") || text.includes("panggil damkar") || text.includes("hubungi damkar") || text.includes("ada kebakaran")) {
    const emergencyHTML = `
      <div class="space-y-2">
        <p class="font-extrabold text-rose-600 flex items-center text-sm">
          <i class="fa-solid fa-triangle-exclamation mr-1.5 animate-bounce"></i> PANGGILAN DARURAT DAMKAR
        </p>
        <p class="text-xs text-slate-700">Layanan Siap Siga Pemadam Kebakaran & Penyelamatan Kota Palopo 24/7.</p>
        <div class="flex flex-col gap-2 pt-1">
          <a href="https://wa.me/6285341341565?text=HALO%20DAMKAR%20PALOPO,%20SAYA%20MEMBUTUHKAN%20BANTUAN%20DARURAT!" target="_blank" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center space-x-2 shadow">
            <i class="fa-brands fa-whatsapp text-sm"></i>
            <span>Chat WhatsApp Damkar Palopo</span>
          </a>
          <a href="tel:085341341565" class="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center space-x-2 shadow">
            <i class="fa-solid fa-phone-volume text-sm"></i>
            <span>Telepon Langsung (0471) 113</span>
          </a>
        </div>
      </div>
    `;
    appendEmergencyMessage(emergencyHTML);
    return true;
  }

  if (text.includes("panggil ambulans") || text.includes("panggil ambulance") || text.includes("telpon ambulans") || text.includes("ada kecelakaan")) {
    const emergencyHTML = `
      <div class="space-y-2">
        <p class="font-extrabold text-rose-600 flex items-center text-sm">
          <i class="fa-solid fa-truck-medical mr-1.5 animate-pulse"></i> PANGGILAN DARURAT AMBULANS (PSC 119)
        </p>
        <p class="text-xs text-slate-700">Layanan Penanganan Medis Darurat & Rujukan Ambulans Kota Palopo.</p>
        <div class="flex flex-col gap-2 pt-1">
          <a href="https://wa.me/628114211911?text=DARURAT%20AMBULANS%20PALOPO!%20Mohon%20bantuan%20segera." target="_blank" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center space-x-2 shadow">
            <i class="fa-brands fa-whatsapp text-sm"></i>
            <span>Chat WhatsApp PSC 119 Palopo</span>
          </a>
          <a href="tel:119" class="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center space-x-2 shadow">
            <i class="fa-solid fa-phone-volume text-sm"></i>
            <span>Call Center 119 (Bebas Pulsa)</span>
          </a>
        </div>
      </div>
    `;
    appendEmergencyMessage(emergencyHTML);
    return true;
  }

  return false;
}

function appendEmergencyMessage(htmlContent) {
  const stream = document.getElementById('chat-stream');
  chatHistory.push({ role: "model", parts: [{ text: "Respon Darurat Ditampilkan" }] });

  stream.insertAdjacentHTML('beforeend', `
    <div class="flex items-start space-x-2.5 my-2">
      <div class="w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center text-xs shrink-0 font-bold shadow-md">
        <i class="fa-solid fa-triangle-exclamation"></i>
      </div>
      <div class="bg-rose-50/80 border border-rose-200 text-xs p-3.5 rounded-2xl rounded-tl-none max-w-[92%] text-slate-700 shadow-sm leading-relaxed space-y-2">
        ${htmlContent}
      </div>
    </div>
  `);
  stream.scrollTop = stream.scrollHeight;
}

// ==========================================
// FITUR VOICE INPUT
// ==========================================

function triggerVoiceInput() {
  const micBtn = document.getElementById('mic-btn');
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert("Fitur pengenal suara tidak didukung oleh browser ini.");
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = 'id-ID';

  recognition.onstart = function() {
    micBtn.classList.add('text-rose-600', 'animate-pulse');
  };

  recognition.onresult = function(event) {
    const transcript = event.results[0][0].transcript;
    document.getElementById('user-input').value = transcript;
    micBtn.classList.remove('text-rose-600', 'animate-pulse');
    handleChatSubmit(new Event('submit'));
  };

  recognition.onerror = function() {
    micBtn.classList.remove('text-rose-600', 'animate-pulse');
  };

  recognition.onend = function() {
    micBtn.classList.remove('text-rose-600', 'animate-pulse');
  };

  recognition.start();
}

// ==========================================
// FITUR TEXT-TO-SPEECH
// ==========================================

function toggleSpeech() {
  const ttsBtn = document.getElementById('tts-btn');

  if (isSpeaking) {
    window.speechSynthesis.cancel();
    isSpeaking = false;
    ttsBtn.classList.remove('text-emerald-600', 'animate-pulse');
    return;
  }

  if (!('speechSynthesis' in window)) {
    alert("Browser Anda belum mendukung fitur pembacaan suara (Text-to-Speech).");
    return;
  }

  const aiMessages = document.querySelectorAll('#chat-stream .chat-body');
  if (aiMessages.length === 0) {
    alert("Belum ada jawaban dari AI untuk dibacakan.");
    return;
  }

  const lastAiMessage = aiMessages[aiMessages.length - 1];
  const textToRead = lastAiMessage.innerText || lastAiMessage.textContent;

  speakText(textToRead);
}

function speakText(text) {
  const ttsBtn = document.getElementById('tts-btn');
  window.speechSynthesis.cancel();

  currentUtterance = new SpeechSynthesisUtterance(text);
  currentUtterance.lang = 'id-ID';
  currentUtterance.rate = 1.0;
  currentUtterance.pitch = 1.0;

  currentUtterance.onstart = function () {
    isSpeaking = true;
    ttsBtn.classList.add('text-emerald-600', 'animate-pulse');
  };

  currentUtterance.onend = function () {
    isSpeaking = false;
    ttsBtn.classList.remove('text-emerald-600', 'animate-pulse');
  };

  currentUtterance.onerror = function () {
    isSpeaking = false;
    ttsBtn.classList.remove('text-emerald-600', 'animate-pulse');
  };

  window.speechSynthesis.speak(currentUtterance);
}

// ==========================================
// FITUR BAHASA
// ==========================================

function changeLanguage() {
  const lang = document.getElementById('lang-select').value;
  const sub = document.getElementById('sub-welcome');
  if (lang === 'tae') sub.innerText = "Aga kaperluangta ri layanan Palopota AI hari ini?";
  else if (lang === 'en') sub.innerText = "How can I assist your public service requests today?";
  else sub.innerText = "Mau dibantu apa hari ini?";
}

// ==========================================
// FITUR AKSESIBILITAS
// ==========================================

function toggleAccessibilityMode() {
  isAccessibilityMode = !isAccessibilityMode;
  localStorage.setItem('PALOPO_ACCESSIBILITY_MODE', isAccessibilityMode);
  applyAccessibilityMode(isAccessibilityMode);
}

function applyAccessibilityMode(enable) {
  const btn = document.getElementById('accessibility-btn');
  if (enable) {
    document.body.classList.add('high-contrast');
    if (btn) btn.classList.add('text-amber-400', 'scale-110');
  } else {
    document.body.classList.remove('high-contrast');
    if (btn) btn.classList.remove('text-amber-400', 'scale-110');
  }
}

// ==========================================
// FITUR POPUP IKM
// ==========================================

function startIdleTimer() {
  if (ikmShownThisSession) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    showIkmPopup();
  }, 5 * 60 * 1000);
}

function showIkmPopup() {
  if (ikmShownThisSession) return;
  const popup = document.getElementById('ikm-popup');
  if (popup) {
    popup.classList.remove('hidden', 'translate-y-4');
    ikmShownThisSession = true;
  }
}

function closeIkmPopup() {
  const popup = document.getElementById('ikm-popup');
  if (popup) {
    popup.classList.add('hidden');
  }
}

// ==========================================
// FITUR CEK HAK BANTUAN
// ==========================================

function openEligibilityModal() {
  document.getElementById('eligibility-modal').classList.remove('hidden');
  document.getElementById('quiz-step-container').classList.remove('hidden');
  document.getElementById('quiz-result-container').classList.add('hidden');
}

function closeEligibilityModal() {
  document.getElementById('eligibility-modal').classList.add('hidden');
}

function calculateEligibility() {
  const kk = document.getElementById('q-kk').value;
  const income = document.getElementById('q-income').value;
  const student = document.getElementById('q-student').value;
  const dtks = document.getElementById('q-dtks').value;

  const stepContainer = document.getElementById('quiz-step-container');
  const resultContainer = document.getElementById('quiz-result-container');

  stepContainer.classList.add('hidden');
  resultContainer.classList.remove('hidden');

  let eligibilityHTML = "";

  if (kk === "tidak") {
    eligibilityHTML = `
      <div class="p-3.5 border rounded-2xl bg-amber-50 border-amber-200 text-amber-900 space-y-2 text-xs">
        <strong class="font-extrabold block text-sm">⚠️ Catatan Domisili KK</strong>
        <p class="text-[11px] leading-relaxed">Bantuan Sosial daerah Kota Palopo dikhususkan bagi pemegang KK Kota Palopo. Anda disarankan melakukan Pindah Domisili terlebih dahulu.</p>
      </div>
    `;
  } else {
    eligibilityHTML = `
      <div class="p-3.5 border rounded-2xl bg-emerald-50 border-emerald-200 text-emerald-900 space-y-2 text-xs">
        <strong class="font-extrabold block text-sm">🟢 Berpotensi Layak Menerima Bantuan</strong>
        <p class="text-[11px] leading-relaxed">Berdasarkan profil Anda, keluarga Anda berpotensi mendapatkan bantuan sosial/beasiswa daerah Palopo.</p>
      </div>
    `;
  }

  eligibilityHTML += `
    <div class="flex space-x-2 pt-1">
      <button onclick="askAI('Syarat pengusulan DTKS dan PKH'); closeEligibilityModal();" class="w-1/2 bg-brand-navy text-white font-bold py-2 rounded-xl text-xs">
        Tanya AI Syarat
      </button>
      <button onclick="openEligibilityModal()" class="w-1/2 bg-slate-100 text-slate-700 font-bold py-2 rounded-xl text-xs">
        Ulangi Cek
      </button>
    </div>
  `;

  resultContainer.innerHTML = eligibilityHTML;
}

// ==========================================
// FITUR CEK GIZI STUNTING
// ==========================================

function openStuntingModal() {
  document.getElementById('stunting-modal').classList.remove('hidden');
  document.getElementById('stunting-form-container').classList.remove('hidden');
  document.getElementById('stunting-result-container').classList.add('hidden');
}

function closeStuntingModal() {
  document.getElementById('stunting-modal').classList.add('hidden');
}

function calculateStunting() {
  const age = parseFloat(document.getElementById('st-age').value);
  const height = parseFloat(document.getElementById('st-height').value);
  const weight = parseFloat(document.getElementById('st-weight').value);

  if (isNaN(age) || isNaN(height) || isNaN(weight)) {
    alert("Mohon isi seluruh data usia, tinggi, dan berat badan dengan benar.");
    return;
  }

  const formContainer = document.getElementById('stunting-form-container');
  const resultContainer = document.getElementById('stunting-result-container');

  formContainer.classList.add('hidden');
  resultContainer.classList.remove('hidden');

  let expectedHeight = 50 + (age * 1.5); 
  let heightDiff = height - expectedHeight;

  let statusTitle = "";
  let statusClass = "";
  let description = "";

  if (heightDiff < -5) {
    statusTitle = "⚠️ Indikasi Risiko Stunting (Sangat Pendek / Pendek)";
    statusClass = "bg-rose-50 border-rose-200 text-rose-900";
    description = "Tinggi badan balita berada di bawah rata-rata standar pertumbuhan seusianya. Disarankan untuk segera melakukan konsultasi ke Posyandu atau Puskesmas terdekat.";
  } else if (heightDiff >= -5 && heightDiff <= 5) {
    statusTitle = "🟢 Pertumbuhan Normal (Gizi Baik)";
    statusClass = "bg-emerald-50 border-emerald-200 text-emerald-900";
    description = "Tinggi dan berat badan balita dalam rentang standar yang sesuai dengan usianya. Pertahankan pola makan bergizi seimbang dan vitamin.";
  } else {
    statusTitle = "🔵 Pertumbuhan Optimal (Tinggi)";
    statusClass = "bg-sky-50 border-sky-200 text-sky-900";
    description = "Tinggi badan balita di atas rata-rata standar pertumbuhannya. Pastikan asupan nutrisi dan pola asuh tetap terjaga.";
  }

  let resultsHTML = `
    <div class="p-3.5 border rounded-2xl ${statusClass} space-y-2 text-xs">
      <strong class="font-extrabold block text-sm">${statusTitle}</strong>
      <p class="text-[11px] leading-relaxed">${description}</p>
    </div>

    <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-[11px] text-slate-600">
      <div class="font-bold text-slate-800 border-b pb-1 mb-1">Rekomendasi Tindakan Lanjut:</div>
      <p>• <strong>Layanan Posyandu & Dinkes:</strong> Kunjungi Puskesmas/Posyandu terdekat di Kota Palopo untuk penimbangan dan konsultasi gizi rutin.</p>
      <p>• <strong>Program PMT:</strong> Ajukan bantuan Pemberian Makanan Tambahan (PMT) balita melalui petugas Puskesmas jika diperlukan.</p>
    </div>

    <div class="flex space-x-2 pt-1">
      <button onclick="askAI('Info puskesmas terdekat dan layanan penanganan stunting dinas kesehatan'); closeStuntingModal();" class="w-1/2 bg-brand-navy text-white font-bold py-2 rounded-xl text-xs">
        Tanya AI Syarat/Lokasi
      </button>
      <button onclick="openStuntingModal()" class="w-1/2 bg-slate-100 text-slate-700 font-bold py-2 rounded-xl text-xs">
        Hitung Ulang
      </button>
    </div>
  `;

  resultContainer.innerHTML = resultsHTML;
}

// ==========================================
// FITUR LOCAL STORAGE
// ==========================================

function saveChatToLocalStorage() {
  const stream = document.getElementById('chat-stream');
  if (!stream) return;

  const chatData = {
    history: chatHistory,
    htmlContent: stream.innerHTML
  };

  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatData));
}

function loadChatFromLocalStorage() {
  const savedData = localStorage.getItem(CHAT_STORAGE_KEY);
  if (!savedData) return;

  try {
    const chatData = JSON.parse(savedData);
    if (chatData.history && chatData.history.length > 0) {
      chatHistory = chatData.history;
      const stream = document.getElementById('chat-stream');
      if (stream && chatData.htmlContent) {
        stream.innerHTML = chatData.htmlContent;
        stream.scrollTop = stream.scrollHeight;
      }
    }
  } catch (e) {
    console.error("Gagal memuat riwayat percakapan lokal:", e);
  }
}

// ==========================================
// CAROUSEL BANNER
// ==========================================

let currentBanner = 0;
const totalBanners = 3;
let bannerInterval = null;

function updateBanner() {
  const slider = document.getElementById('banner-slider');
  const dots = document.querySelectorAll('.banner-dot');
  if (!slider) return;

  slider.style.transform = `translateX(-${currentBanner * 100}%)`;

  dots.forEach((dot, index) => {
    if (index === currentBanner) {
      dot.classList.remove('bg-white/50', 'w-2');
      dot.classList.add('bg-white', 'w-5');
    } else {
      dot.classList.remove('bg-white', 'w-5');
      dot.classList.add('bg-white/50', 'w-2');
    }
  });
}

function goToBanner(index) {
  currentBanner = index;
  updateBanner();
  resetBannerTimer();
}

function nextBanner() {
  currentBanner = (currentBanner + 1) % totalBanners;
  updateBanner();
}

function resetBannerTimer() {
  clearInterval(bannerInterval);
  bannerInterval = setInterval(nextBanner, 30000);
}

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', function() {
  // Load Knowledge Base
  loadKnowledgeBaseFromSheet();
  
  // Load Chat History
  loadChatFromLocalStorage();
  
  // Load Accessibility Mode
  if (isAccessibilityMode) {
    applyAccessibilityMode(true);
  }
  
  // Start Banner Timer
  bannerInterval = setInterval(nextBanner, 30000);
  
  // Start Idle Timer
  startIdleTimer();

  // Banner Swipe Support
  const bannerContainer = document.getElementById('banner-container');
  if (bannerContainer) {
    let touchStartX = 0;
    let touchEndX = 0;

    bannerContainer.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    bannerContainer.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      const swipeThreshold = 30;
      if (touchStartX - touchEndX > swipeThreshold) {
        currentBanner = (currentBanner + 1) % totalBanners;
        updateBanner();
        resetBannerTimer();
      } else if (touchEndX - touchStartX > swipeThreshold) {
        currentBanner = (currentBanner - 1 + totalBanners) % totalBanners;
        updateBanner();
        resetBannerTimer();
      }
    }, { passive: true });

    bannerContainer.addEventListener('mousedown', (e) => {
      touchStartX = e.clientX;
    });

    bannerContainer.addEventListener('mouseup', (e) => {
      touchEndX = e.clientX;
      const swipeThreshold = 30;
      if (touchStartX - touchEndX > swipeThreshold) {
        currentBanner = (currentBanner + 1) % totalBanners;
        updateBanner();
        resetBannerTimer();
      } else if (touchEndX - touchStartX > swipeThreshold) {
        currentBanner = (currentBanner - 1 + totalBanners) % totalBanners;
        updateBanner();
        resetBannerTimer();
      }
    });

// ==========================================
// NOTIFIKASI PUSH - SUBSCRIBE / UNSUBSCRIBE
// ==========================================

// Cek status subscription saat load
async function checkPushSubscriptionStatus() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    document.getElementById('push-subscribe-label').textContent = 'Notifikasi (Tidak Didukung)';
    document.getElementById('push-subscribe-btn').disabled = true;
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      // Sudah subscribe
      document.getElementById('push-subscribe-label').textContent = 'Nonaktifkan Notifikasi';
      document.getElementById('push-subscribe-btn').querySelector('i').className = 'fa-regular fa-bell-slash text-rose-500';
      localStorage.setItem('PALOPO_PUSH_ACTIVE', 'true');
    } else {
      document.getElementById('push-subscribe-label').textContent = 'Aktifkan Notifikasi';
      document.getElementById('push-subscribe-btn').querySelector('i').className = 'fa-regular fa-bell text-brand-cyan';
      localStorage.setItem('PALOPO_PUSH_ACTIVE', 'false');
    }
  } catch (e) {
    console.warn('Gagal cek status push:', e);
  }
}

// Toggle subscribe / unsubscribe
async function togglePushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('Browser Anda tidak mendukung notifikasi push. Gunakan Chrome atau Edge terbaru.');
    return;
  }

  const btn = document.getElementById('push-subscribe-btn');
  const label = document.getElementById('push-subscribe-label');
  
  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      // UNSUBSCRIBE
      await subscription.unsubscribe();
      label.textContent = 'Aktifkan Notifikasi';
      btn.querySelector('i').className = 'fa-regular fa-bell text-brand-cyan';
      localStorage.setItem('PALOPO_PUSH_ACTIVE', 'false');
      // Hapus dari daftar subscription yang tersimpan
      let subs = JSON.parse(localStorage.getItem('PALOPO_PUSH_SUBSCRIPTIONS') || '[]');
      subs = subs.filter(s => s.endpoint !== subscription.endpoint);
      localStorage.setItem('PALOPO_PUSH_SUBSCRIPTIONS', JSON.stringify(subs));
      alert('Notifikasi dinonaktifkan.');
    } else {
      // SUBSCRIBE - butuh VAPID public key
      // Untuk demo, kita gunakan key yang valid (anda bisa dapatkan dari web-push library)
      // Jika tidak punya, kita hanya mensimulasikan (tanpa server key)
      // Sebaiknya anda buat VAPID key sendiri atau gunakan Firebase
      const vapidPublicKey = 'BL6k...'; // Ganti dengan public key Anda
      
      // Periksa apakah key valid (minimal 65 karakter)
      if (vapidPublicKey.length < 65) {
        alert('⚠️ VAPID Public Key belum diatur. Untuk demo, notifikasi akan disimpan di localStorage.\n\n' +
              'Cara dapatkan key:\n' +
              '1. Kunjungi https://web-push-codelab.glitch.me/\n' +
              '2. Copy VAPID Public Key\n' +
              '3. Ganti const vapidPublicKey di kode ini');
        // Simulasi subscribe (tanpa push nyata)
        label.textContent = 'Notifikasi (Simulasi)';
        btn.querySelector('i').className = 'fa-regular fa-bell-check text-emerald-500';
        localStorage.setItem('PALOPO_PUSH_ACTIVE', 'simulasi');
        alert('✅ Notifikasi diaktifkan (mode simulasi).\n\n' +
              'Untuk push nyata, atur VAPID key dan backend.');
        return;
      }

      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
      });

      // Simpan subscription
      let subs = JSON.parse(localStorage.getItem('PALOPO_PUSH_SUBSCRIPTIONS') || '[]');
      subs.push(subscription);
      localStorage.setItem('PALOPO_PUSH_SUBSCRIPTIONS', JSON.stringify(subs));
      
      label.textContent = 'Nonaktifkan Notifikasi';
      btn.querySelector('i').className = 'fa-regular fa-bell-slash text-rose-500';
      localStorage.setItem('PALOPO_PUSH_ACTIVE', 'true');
      alert('✅ Notifikasi diaktifkan! Anda akan menerima pemberitahuan dari PALOPOTA AI.');
    }
  } catch (e) {
    console.error('Error toggle push:', e);
    alert('Gagal mengubah status notifikasi: ' + e.message);
  }
}

// Helper: ubah base64 ke Uint8Array (untuk VAPID)
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Panggil saat halaman dimuat untuk cek status
document.addEventListener('DOMContentLoaded', function() {
  // ... kode yang sudah ada ...
  if (document.getElementById('push-subscribe-btn')) {
    checkPushSubscriptionStatus();
  }
});

  }
});
