// ==========================================
// VARIABEL GLOBAL & KONFIGURASI
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

// Carousel State
let currentBanner = 0;
const totalBanners = 3;
let bannerInterval = null;

// ==========================================
// FUNGSI UTAMA & UTILITY
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
  const sideDrawer = document.getElementById('side-drawer');
  if (sideDrawer) sideDrawer.classList.toggle('hidden');
}

// ==========================================
// NAVIGASI TAMPILAN (DESKTOP & MOBILE)
// ==========================================

function showHomeScreen() {
  const homeScreen = document.getElementById('home-screen');
  const chatScreen = document.getElementById('chat-screen');

  // Di mobile: tampilkan beranda, sembunyikan chat
  if (window.innerWidth < 1024) {
    if (homeScreen) homeScreen.classList.remove('hidden');
    if (chatScreen) {
      chatScreen.classList.add('hidden');
      chatScreen.classList.remove('flex');
    }
  }
  // Di desktop: keduanya tetap tampil (tidak ada aksi)
}

function showChatScreen() {
  const homeScreen = document.getElementById('home-screen');
  const chatScreen = document.getElementById('chat-screen');

  // Di mobile: tampilkan chat, sembunyikan beranda
  if (window.innerWidth < 1024) {
    if (homeScreen) homeScreen.classList.add('hidden');
    if (chatScreen) {
      chatScreen.classList.remove('hidden');
      chatScreen.classList.add('flex');
    }
  }
  // Di desktop: keduanya tetap tampil
}

// Helper: Escape HTML untuk Keamanan (XSS Prevention)
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==========================================
// FUNGSI CHAT & FEEDBACK
// ==========================================

async function handleChatSubmit(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('user-input');
  if (!input) return;
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
  if (isEmergency) return;

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

function sendQuickPrompt(promptText) {
  const input = document.getElementById('user-input');
  if (input) {
    input.value = promptText;
    handleChatSubmit(new Event('submit'));
  }
}

function appendUserMessage(text) {
  const stream = document.getElementById('chat-stream');
  if (!stream) return;

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

function appendAIMessage(markdownText) {
  const stream = document.getElementById('chat-stream');
  if (!stream) return;

  chatHistory.push({ role: "model", parts: [{ text: markdownText }] });

  const htmlContent = (typeof marked !== 'undefined') ? marked.parse(markdownText) : markdownText;
  const messageId = 'msg-' + Date.now();

  stream.insertAdjacentHTML('beforeend', `
    <div class="flex items-start space-x-2.5 my-2" id="${messageId}">
      <div style="width: 32px; height: 32px; border-radius: 9999px; background-color: #06b6d4; color: white; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; flex-shrink: 0; font-weight: 700; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">AI</div>
      <div style="background-color: white; border: 1px solid #e2e8f0; font-size: 0.75rem; padding: 0.75rem; border-radius: 1rem; border-top-left-radius: 0; max-width: 92%; color: #334155; box-shadow: 0 1px 2px rgba(0,0,0,0.05); line-height: 1.625;" class="chat-body">
        ${htmlContent}
        
        <!-- AREA FEEDBACK -->
        <div class="mt-3 pt-2.5 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span class="text-[11px] text-slate-400 font-medium">Apakah jawaban ini membantu?</span>
          <div class="flex items-center gap-2 shrink-0">
            <button onclick="sendFeedback('${messageId}', '👍')" 
                    class="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/60 transition-colors text-emerald-700 font-bold text-[11px] whitespace-nowrap shadow-sm">
              <span class="text-xs">👍</span>
              <span>Membantu</span>
            </button>
            <button onclick="sendFeedback('${messageId}', '👎')" 
                    class="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200/60 transition-colors text-rose-600 font-bold text-[11px] whitespace-nowrap shadow-sm">
              <span class="text-xs">👎</span>
              <span>Tidak</span>
            </button>
          </div>
          <span id="feedback-${messageId}" class="text-[10px] text-slate-400"></span>
        </div>
      </div>
    </div>
  `);
  stream.scrollTop = stream.scrollHeight;
  saveChatToLocalStorage();
}

function sendFeedback(messageId, type) {
  const feedbackSpan = document.getElementById(`feedback-${messageId}`);
  if (!feedbackSpan || feedbackSpan.dataset.sent) return;

  const parentDiv = document.getElementById(messageId);
  const aiMessage = parentDiv ? (parentDiv.querySelector('.chat-body')?.innerText || 'Konten tidak terbaca') : '';

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

  sendFeedbackToSheet(aiMessage, type);
}

async function sendFeedbackToSheet(content, type) {
  try {
    await fetch(GOOGLE_SHEET_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'feedback', content, type, timestamp: new Date().toISOString() })
    });
    console.log('Feedback terkirim ke Google Sheets');
  } catch (e) {
    console.warn('Gagal kirim feedback ke Google Sheets:', e);
  }
}

function showAITypingIndicator() {
  const stream = document.getElementById('chat-stream');
  if (!stream) return;

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

function removeAITypingIndicator() {
  const el = document.getElementById('ai-typing');
  if (el) el.remove();
}

function clearChat() {
  chatHistory = [];
  localStorage.removeItem(CHAT_STORAGE_KEY);

  const stream = document.getElementById('chat-stream');
  if (stream) {
    stream.innerHTML = `
      <div class="flex items-start space-x-2.5 my-1">
        <div class="w-8 h-8 rounded-full bg-brand-navy text-white flex items-center justify-center text-xs shrink-0 font-bold shadow-sm">AI</div>
        <div class="bg-white border border-slate-200 text-xs p-3.5 rounded-2xl rounded-tl-none max-w-[88%] text-slate-700 shadow-sm">
          Riwayat percakapan telah dibersihkan. Silakan tanyakan informasi layanan publik lainnya!
        </div>
      </div>
    `;
  }
}

// ==========================================
// API & FALLBACK ENGINE
// ==========================================

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

async function fallbackLLMEngine(prompt) {
  await new Promise(r => setTimeout(r, 1000));
  const text = prompt.toLowerCase();

  // 1. Cek Knowledge Base Google Sheets
  if (sheetKnowledgeBase && sheetKnowledgeBase.length > 0) {
    for (let item of sheetKnowledgeBase) {
      if (item.keyword && text.includes(item.keyword.toLowerCase())) {
        return item.response;
      }
    }
  }

  // 2. Layanan Kependudukan
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
  } else if (text.includes("lapor") || text.includes("melapor") || text.includes("pengaduan") || text.includes("oke sappo")) {
    return "**📢 Layanan Pengaduan Masyarakat (Oke Sappo!)**\n\n" +
           "Anda dapat menyampaikan laporan, keluhan, maupun aspirasi terkait pelayanan publik di Kota Palopo secara langsung melalui **OKE SAPPO!** yang dikelola oleh **Diskominfo SP Kota Palopo**.\n\n" +
           "Silakan klik tombol di bawah ini untuk terhubung langsung dengan Admin Pengaduan via WhatsApp:\n\n" +
           "<div class='pt-2 pb-1'><a href='https://wa.me/6285165478686?text=HALO%20ADMIN%20OKE%20SAPPO!,%20Saya%20ingin%20menyampaikan%20laporan/pengaduan.' target='_blank' class='inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-xl text-xs shadow transition'><i class='fa-brands fa-whatsapp text-sm'></i><span>Lapor via OKE SAPPO! (WhatsApp)</span></a></div>";
  } else if (text.includes("pajak") || text.includes("bayar pajak") || text.includes("aksara") || text.includes("smart tax") || text.includes("pbb")) {
    return "**💳 Layanan Pembayaran Pajak Daerah (AKSARA SMART TAX)**\n\n" +
           "Untuk kemudahan pembayaran Pajak Daerah (PBB-P2, Pajak Restoran, Reklame, dll.), Anda dapat mengakses aplikasi resmi **AKSARA SMART TAX** yang dikelola oleh **BAPENDA Kota Palopo**.\n\n" +
           "Silakan klik tombol di bawah ini untuk membuka portal/aplikasi pembayaran pajak:\n\n" +
           `<div class='pt-2 pb-1'>
              <a href='https://pajakdaerah.palopokota.go.id' target='_blank' 
                 style='display: inline-flex; align-items: center; gap: 8px; background-color: #0f3c5f; color: white; font-weight: bold; padding: 8px 16px; border-radius: 12px; font-size: 0.75rem; text-decoration: none; box-shadow: 0 2px 6px rgba(15,60,95,0.3); transition: background 0.2s;'>
                <i class='fa-solid fa-credit-card' style='font-size: 0.9rem;'></i>
                <span>Buka AKSARA SMART TAX</span>
              </a>
            </div>`;
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
  } else if (text.includes("profil palopo") || text.includes("tentang palopo") || text.includes("dimana kota palopo")) {
    return "🌆 **Profil Singkat Kota Palopo:**\n\nPalopo adalah kota otonom di Sulawesi Selatan yang dikenal sebagai pusat sejarah Kedatuan Luwu serta berkembang pesat sebagai kota jasa, perdagangan, dan pendidikan di kawasan Luwu Raya.";
  } else if (text.includes("hari jadi kota palopo") || text.includes("ulang tahun palopo") || text.includes("hut palopo")) {
    return "🎉 **Hari Jadi Kota Palopo** diperingati setiap tanggal **2 Juli**.\n\nKota Palopo resmi terbentuk sebagai daerah otonom berdasarkan Undang-Undang Nomor 11 Tahun 2002.";
  } else if (text.includes("kantor wali kota") || text.includes("kantor walikota") || text.includes("pemerintahan")) {
    return "🏛️ **Pemerintahan Kota Palopo** berpusat di Balai Kota Palopo (Jl. Andi Djemma).\n\nInformasi resmi terkait jajaran pimpinan dan struktur organisasi daerah dapat diakses melalui portal resmi Pemkot Palopo (palopokota.go.id).";
  } else if (text.includes("wisata") || text.includes("destinasi") || text.includes("liburan") || text.includes("jalan-jalan")) {
    return "🌴 **Destinasi Wisata Unggulan Kota Palopo:**\n\n" +
           "• **Wisata Sejarah & Budaya:** Istana Datu Luwu, Masjid Jami Tua Palopo\n" +
           "• **Wisata Alam & Rekreasi:** Permandian Alam Latuppa, Kambo Highland (Bukit Kambo), Pantai Labombo, Gua Kancing\n" +
           "• **Kuliner:** Pusat Kuliner Lagota (Kapurung, Dange, Pacco)";
  } else if (text.includes("assalamualaikum") || text.includes("salam")) {
    return "Wa'alaikumsalam Warahmatullahi Wabarakatuh! 🌿\n\nSelamat datang di Layanan **Palopota AI**. Saya siap membantu Anda seputar pengurusan dokumen, izin UMKM, atau informasi layanan publik Kota Palopo. Ada yang bisa saya bantu hari ini?";
  } else if (text.includes("halo") || text.includes("hai") || text.includes("hello")) {
    return "Halo! 👋 Selamat datang di **Palopota AI**.\n\nSaya asisten digital resmi Kota Palopo. Silakan tanyakan syarat pembuatan KTP, KK, Akta Kelahiran, NIB UMKM, Beasiswa, Bansos, atau layanan OPD lainnya!";
  } else if (text.includes("tabe") || text.includes("salama")) {
    return "Salama’ki tapada salama! Tabe', aga kaperluangta ri layanan **Palopota AI** hari ini?\n\nSaya siap membantu pengurusan berkas kependudukan, perizinan, dan informasi layanan publik di Kota Palopo.";
  } else if (text.includes("terima kasih") || text.includes("makasih") || text.includes("thanks") || text.includes("makkasora")) {
    return "Sama-sama! 😊 Senang sekali bisa membantu Anda.\n\nJika masih ada dokumen atau layanan publik Kota Palopo yang ingin ditanyakan, jangan ragu untuk menyapa saya kembali. Palopota AI selalu siap 24/7 untuk Anda!";
  } else if (text.includes("siapa kamu") || text.includes("perkenalan") || text.includes("tentang aplikasi")) {
    return "Saya adalah **Palopota AI**, asisten digital resmi Pemerintah Kota Palopo. 🤖\n\nSaya dirancang untuk memberikan informasi cepat, akurat, dan transparan terkait syarat dokumen, alur perizinan, fasilitas kesehatan, serta lokasi kantor dinas di Kota Palopo.";
  } else {
    return `Terima kasih atas pertanyaan Anda mengenai **"${escapeHtml(prompt)}"**.\n\n` +
           `Sebagai Asisten AI Kota Palopo, saya dapat membimbing Anda mengenai:\n` +
           `* **Disdukcapil:** KTP-el, KK, Akta Lahir/Kematian, Surat Pindah.\n` +
           `* **DPMPTSP:** NIB UMKM, Sertifikat Halal, PBG Bangunan.\n` +
           `* **Dinas Sosial:** DTKS, PKH, BPNT, SKTM.\n\n`;
  }
}

// ==========================================
// FITUR MODAL & DIREKTORI
// ==========================================

function openFeatureModal(type) {
  const modal = document.getElementById('feature-modal');
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');
  if (!modal || !title || !body) return;

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
          <button onclick="askAI('Syarat pengurusan Akta Kematian dan KK baru')" class="text-[10px] bg-slate-700 text-white px-2.5
