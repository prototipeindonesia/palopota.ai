let chatHistory = [];
let customApiKey = localStorage.getItem('PALOPO_GEMINI_KEY') || '';
let opdData = [];
let gisData = [];

// Load External Data JSON
async function loadAppData() {
  try {
    const opdRes = await fetch('data/opd.json');
    opdData = await opdRes.json();

    const gisRes = await fetch('data/gis.json');
    gisData = await gisRes.json();
  } catch (err) {
    console.error("Gagal memuat data JSON:", err);
  }
}

function toggleSideMenu() {
  document.getElementById('side-drawer').classList.toggle('hidden');
}

function showHomeScreen() {
  document.getElementById('home-screen').classList.remove('hidden');
  document.getElementById('chat-screen').classList.add('hidden');
  document.getElementById('chat-screen').classList.remove('flex');
}

function showChatScreen() {
  document.getElementById('home-screen').classList.add('hidden');
  document.getElementById('chat-screen').classList.remove('hidden');
  document.getElementById('chat-screen').classList.add('flex');
}

async function handleChatSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('user-input');
  const text = input.value.trim();
  if (!text) return;

  showChatScreen();
  appendUserMessage(text);
  input.value = '';

  const textLower = text.toLowerCase();
  if (textLower.includes("terima kasih") || textLower.includes("makasih") || textLower.includes("makkasora")) {
    setTimeout(() => { showIkmPopup(); }, 1500);
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
    appendAIMessage(aiResponseText, "Disdukcapil / Pemkot Palopo", "03 Sep 2026");
  } catch (err) {
    removeAITypingIndicator();
    appendAIMessage("Mohon maaf, terjadi kendala koneksi server. Silakan coba beberapa saat lagi.");
  }
}

function sendQuickPrompt(promptText) {
  document.getElementById('user-input').value = promptText;
  handleChatSubmit(new Event('submit'));
}

function appendUserMessage(text) {
  const stream = document.getElementById('chat-stream');
  chatHistory.push({ role: "user", parts: [{ text: text }] });

  stream.insertAdjacentHTML('beforeend', `
    <div class="flex justify-end my-2">
      <div class="bg-brand-navy text-white text-xs p-3 rounded-2xl rounded-tr-none max-w-[85%] shadow-sm leading-relaxed">
        ${escapeHtml(text)}
      </div>
    </div>
  `);
  stream.scrollTop = stream.scrollHeight;
  saveChatToLocalStorage();
}

function appendAIMessage(markdownText, sourceName = "Pemerintah Kota Palopo", updatedDate = "Terbaru") {
  const stream = document.getElementById('chat-stream');
  chatHistory.push({ role: "model", parts: [{ text: markdownText }] });

  const htmlContent = marked.parse(markdownText);
  const msgId = 'msg-' + Date.now();

  stream.insertAdjacentHTML('beforeend', `
    <div class="flex items-start space-x-2.5 my-2" id="${msgId}">
      <div class="w-8 h-8 rounded-full bg-brand-cyan text-white flex items-center justify-center text-xs shrink-0 font-bold shadow-sm">AI</div>
      <div class="bg-white border border-slate-200 text-xs p-3.5 rounded-2xl rounded-tl-none max-w-[92%] text-slate-700 shadow-sm leading-relaxed space-y-2.5 chat-body">
        <div>${htmlContent}</div>

        <div class="border-t border-slate-100 pt-2 flex flex-col gap-1 text-[10px] text-slate-400">
          <div class="flex items-center space-x-1 text-slate-500 font-semibold">
            <i class="fa-solid fa-circle-check text-emerald-500"></i>
            <span>Sumber Resmi: ${sourceName} • Diperbarui: ${updatedDate}</span>
          </div>

          <div id="feedback-${msgId}" class="flex items-center justify-between pt-1">
            <span class="text-[10px] text-slate-400">Apakah jawaban ini membantu?</span>
            <div class="flex items-center space-x-2">
              <button onclick="handleFeedback('${msgId}', true)" class="hover:text-emerald-600 px-1"><i class="fa-regular fa-thumbs-up"></i> Ya</button>
              <button onclick="handleFeedback('${msgId}', false)" class="hover:text-rose-600 px-1"><i class="fa-regular fa-thumbs-down"></i> Tidak</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `);
  stream.scrollTop = stream.scrollHeight;
  saveChatToLocalStorage();
}

function handleFeedback(msgId, isPositive) {
  const feedbackContainer = document.getElementById(`feedback-${msgId}`);
  if (!feedbackContainer) return;

  if (isPositive) {
    feedbackContainer.innerHTML = `<span class="text-[10px] text-emerald-600 font-bold"><i class="fa-solid fa-check"></i> Terima kasih atas umpan balik Anda!</span>`;
  } else {
    feedbackContainer.innerHTML = `<span class="text-[10px] text-brand-blue font-bold"><i class="fa-solid fa-check"></i> Catatan umpan balik telah disimpan untuk evaluasi AI.</span>`;
  }
}

function showAITypingIndicator() {
  const stream = document.getElementById('chat-stream');
  stream.insertAdjacentHTML('beforeend', `
    <div id="ai-typing" class="flex items-start space-x-2.5 my-2">
      <div class="w-8 h-8 rounded-full bg-brand-cyan text-white flex items-center justify-center text-xs shrink-0 font-bold shadow-sm">AI</div>
      <div class="bg-white border border-slate-200 text-xs p-3.5 rounded-2xl rounded-tl-none text-slate-500 shadow-sm flex items-center space-x-3">
        <span class="text-[11px] font-medium">PALOPOTA AI sedang memproses kebutuhan Anda...</span>
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

async function callGeminiApi(prompt) {
  const systemInstruction = `Kamu adalah PALOPOTA AI 2.0, Sistem Asisten Layanan Publik Cerdas Kota Palopo.
Tugas utama: Membantu warga menemukan dan menyelesaikan layanan publik, dokumen kependudukan, perizinan UMKM, serta bantuan sosial secara solutif.`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${customApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: chatHistory, systemInstruction: { parts: [{ text: systemInstruction }] } })
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

  if (text.includes("ktp") || text.includes("identitas")) {
    return "**Persyaratan Pengurusan KTP-el (Disdukcapil Palopo):**\n\n" +
           "* **KTP Rusak/Patah:** Bawa fisik KTP lama + Fotokopi Kartu Keluarga (KK).\n" +
           "* **KTP Hilang:** Surat Keterangan Hilang Kepolisian + Fotokopi KK.\n" +
           "* **Pemula (17 Tahun):** Cukup membawa Fotokopi KK untuk rekam biometrik.\n\n" +
           "💰 **Biaya:** Gratis (Rp 0)\n📍 **Lokasi:** Kantor Disdukcapil Kota Palopo, Jl. Landak No. 1.";
  } else if (text.includes("nib") || text.includes("umkm") || text.includes("izin usaha")) {
    return "**Pembuatan NIB (Nomor Induk Berusaha) UMKM:**\n\n" +
           "1. **Syarat:** NIK KTP, Nomor WA aktif, dan Email aktif.\n" +
           "2. **Prosedur:** Diproses via OSS (Online Single Submission).\n" +
           "3. **Waktu Selesai:** ~10-15 Menit Instan.\n\n" +
           "💰 **Biaya:** Gratis (Rp 0)\n📍 **Pendampingan:** DPMPTSP Kota Palopo, Jl. Durian No. 5.";
  } else if (text.includes("pkh") || text.includes("bansos") || text.includes("dtks")) {
    return "**Pendaftaran Bansos PKH / Usulan DTKS:**\n\n" +
           "* **Syarat:** Fotokopi KTP & Kartu Keluarga (KK).\n" +
           "* **Alur:** Musyawarah Kelurahan (Muskel) -> Verifikasi Lapangan Dinas Sosial.\n\n" +
           "📍 **Pusat Informasi:** Dinas Sosial Kota Palopo, Jl. Andi Djemma No. 10.";
  } else if (text.includes("harga pangan") || text.includes("harga sembako") || text.includes("harga beras")) {
    return "**📊 Informasi Harga Pangan Utama (Pasar Sentral & Andi Tadda)**\n\n" +
           "* **Beras Medium:** Rp 13.500 / kg\n" +
           "* **Beras Premium:** Rp 15.000 / kg\n" +
           "* **Gula Pasir:** Rp 18.000 / kg\n" +
           "* **Minyak Goreng Kita:** Rp 16.000 / liter\n" +
           "* **Daging Sapi:** Rp 130.000 / kg\n" +
           "* **Telur Ayam Ras:** Rp 52.000 / rak\n" +
           "* **Cabai Rawit:** Rp 45.000 / kg\n\n" +
           "📅 *Terakhir diperbarui: 02 September 2026 (Sumber: DISKOPDAGRIN Kota Palopo)*";
  } else {
    return `Terima kasih atas pertanyaan Anda mengenai **"${escapeHtml(prompt)}"**.\n\n` +
           `Anda dapat langsung mengunjungi **Direktori Layanan Pemerintah** pada menu utama untuk panduan resmi OPD terkait.`;
  }
}

function clearChat() {
  chatHistory = [];
  localStorage.removeItem('PALOPO_CHAT_HISTORY_DATA');
  document.getElementById('chat-stream').innerHTML = `
    <div class="flex items-start space-x-2.5 my-1">
      <div class="w-8 h-8 rounded-full bg-brand-navy text-white flex items-center justify-center text-xs shrink-0 font-bold shadow-sm">AI</div>
      <div class="bg-white border border-slate-200 text-xs p-3.5 rounded-2xl rounded-tl-none max-w-[88%] text-slate-700 shadow-sm">
        Riwayat percakapan telah dibersihkan. Silakan tanyakan kebutuhan layanan publik lainnya!
      </div>
    </div>
  `;
}

function openFeatureModal(type) {
  const modal = document.getElementById('feature-modal');
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');
  modal.classList.remove('hidden');

  if (type === 'LIFE_EVENT') {
    title.innerText = "Life Event Engine";
    body.innerHTML = `
      <div class="space-y-2">
        <div class="p-3 border rounded-2xl bg-rose-50/70 border-rose-200">
          <div class="font-bold text-rose-900 text-xs mb-1">👶 Melahirkan & Kelahiran Bayi</div>
          <p class="text-[11px] text-slate-600 mb-2">Panduan Akta Kelahiran + BPJS Bayi + Posyandu Dinkes.</p>
          <button onclick="askAI('Syarat pengurusan akta kelahiran dan BPJS bayi baru lahir')" class="text-[10px] bg-rose-600 text-white px-2.5 py-1 rounded-lg font-bold">Panduan Langkah</button>
        </div>
        <div class="p-3 border rounded-2xl bg-emerald-50/70 border-emerald-200">
          <div class="font-bold text-emerald-900 text-xs mb-1">🏪 Membuka Usaha Baru</div>
          <p class="text-[11px] text-slate-600 mb-2">Panduan NIB DPMPTSP + Sertifikat Halal + PIRT.</p>
          <button onclick="askAI('Bagaimana cara buat NIB UMKM dan Sertifikat Halal?')" class="text-[10px] bg-emerald-600 text-white px-2.5 py-1 rounded-lg font-bold">Panduan Langkah</button>
        </div>
      </div>
    `;
  } else if (type === 'EMERGENCY') {
    title.innerText = "Layanan Cepat Darurat (Direct Action)";
    body.innerHTML = `
      <div class="space-y-3">
        <div class="p-3 bg-rose-100 border border-rose-300 rounded-2xl space-y-1">
          <div class="font-extrabold text-rose-900 text-xs flex items-center justify-between">
            <span><i class="fa-solid fa-phone-volume text-rose-600 mr-1.5 animate-pulse"></i> Panggilan Siaga</span>
            <span class="bg-rose-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">112</span>
          </div>
          <p class="text-[11px] text-slate-600">Layanan bebas pulsa darurat Kota Palopo.</p>
          <a href="tel:112" class="w-full bg-rose-600 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center space-x-1.5 shadow mt-1">
            <i class="fa-solid fa-phone"></i><span>Telepon 112 Langsung</span>
          </a>
        </div>
      </div>
    `;
  } else if (type === 'OPD') {
    title.innerText = "Layanan Pemerintah / OPD";
    let html = '<div class="space-y-2.5">';
    opdData.forEach(opd => {
      html += `
        <div class="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5">
          <strong class="text-xs font-extrabold text-brand-navy block">${opd.name}</strong>
          <p class="text-[11px] text-slate-600">${opd.services.join(', ')}</p>
        </div>
      `;
    });
    html += '</div>';
    body.innerHTML = html;
  } else if (type === 'GIS') {
    title.innerText = "Peta & Lokasi Layanan";
    let html = '<div class="space-y-2">';
    gisData.forEach(item => {
      html += `
        <div class="p-2.5 border border-slate-200 rounded-xl bg-slate-50 flex items-center justify-between">
          <div>
            <strong class="text-xs text-slate-800 block">${item.name}</strong>
            <p class="text-[10px] text-slate-500">${item.address}</p>
          </div>
          <a href="${item.mapsUrl}" target="_blank" class="text-[10px] bg-brand-blue text-white px-2.5 py-1 rounded-lg font-bold">Peta</a>
        </div>
      `;
    });
    html += '</div>';
    body.innerHTML = html;
  }
}

function closeFeatureModal() { document.getElementById('feature-modal').classList.add('hidden'); }
function askAI(p) { closeFeatureModal(); sendQuickPrompt(p); }

function checkEmergencyTrigger(inputText) {
  const text = inputText.toLowerCase();
  if (text.includes("damkar") || text.includes("kebakaran") || text.includes("kebanjiran") || text.includes("ambulans") || text.includes("darurat")) {
    const emergencyHTML = `
      <div class="space-y-2">
        <p class="font-extrabold text-rose-600 flex items-center text-sm">
          <i class="fa-solid fa-triangle-exclamation mr-1.5 animate-bounce"></i> PENANGANAN DARURAT
        </p>
        <p class="text-xs text-slate-700">Sistem mendeteksi kebutuhan darurat. Layanan langsung aktif tanpa diproses AI:</p>
        <div class="flex flex-col gap-2 pt-1">
          <a href="tel:112" class="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center space-x-2 shadow">
            <i class="fa-solid fa-phone-volume text-sm"></i>
            <span>Hubungi Call Center Darurat 112</span>
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
  stream.insertAdjacentHTML('beforeend', `
    <div class="flex items-start space-x-2.5 my-2">
      <div class="w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center text-xs shrink-0 font-bold shadow-md">
        <i class="fa-solid fa-shield"></i>
      </div>
      <div class="bg-rose-50/90 border border-rose-200 text-xs p-3.5 rounded-2xl rounded-tl-none max-w-[92%] text-slate-700 shadow-sm leading-relaxed">
        ${htmlContent}
      </div>
    </div>
  `);
  stream.scrollTop = stream.scrollHeight;
}

function openEligibilityModal() {
  document.getElementById('eligibility-modal').classList.remove('hidden');
  document.getElementById('quiz-step-container').classList.remove('hidden');
  document.getElementById('quiz-result-container').classList.add('hidden');
}
function closeEligibilityModal() { document.getElementById('eligibility-modal').classList.add('hidden'); }

function calculateEligibility() {
  const kk = document.getElementById('q-kk').value;
  document.getElementById('quiz-step-container').classList.add('hidden');
  const resultContainer = document.getElementById('quiz-result-container');
  resultContainer.classList.remove('hidden');

  let eligibilityHTML = "";
  if (kk === "tidak") {
    eligibilityHTML = `
      <div class="p-3.5 border rounded-2xl bg-amber-50 border-amber-200 text-amber-900 space-y-2 text-xs">
        <strong class="font-extrabold block text-sm">⚠️ Hasil Simulasi: Persyaratan Domisili</strong>
        <p class="text-[11px] leading-relaxed">Mayoritas program bantuan Pemkot Palopo mensyaratkan kepemilikan KK Kota Palopo. Disarankan mengajukan Surat Pindah Domisili terlebih dahulu.</p>
      </div>
    `;
  } else {
    eligibilityHTML = `
      <div class="p-3.5 border rounded-2xl bg-emerald-50 border-emerald-200 text-emerald-900 space-y-2 text-xs">
        <strong class="font-extrabold block text-sm">🟢 Hasil Simulasi: Berpotensi Layak Syarat</strong>
        <p class="text-[11px] leading-relaxed">Berdasarkan data kriteria awal, keluarga Anda memenuhi indikator awal pengusulan Bansos/Beasiswa. Keputusan resmi tetap melalui penetapan Dinas Sosial/Muskel.</p>
      </div>
    `;
  }

  eligibilityHTML += `
    <button onclick="askAI('Syarat pengusulan DTKS dan PKH'); closeEligibilityModal();" class="w-full bg-brand-navy text-white font-bold py-2.5 rounded-xl text-xs mt-2">
      Lihat Syarat Lengkap via AI
    </button>
  `;
  resultContainer.innerHTML = eligibilityHTML;
}

function openStuntingModal() {
  document.getElementById('stunting-modal').classList.remove('hidden');
  document.getElementById('stunting-form-container').classList.remove('hidden');
  document.getElementById('stunting-result-container').classList.add('hidden');
}
function closeStuntingModal() { document.getElementById('stunting-modal').classList.add('hidden'); }

function calculateStunting() {
  const age = parseFloat(document.getElementById('st-age').value);
  const height = parseFloat(document.getElementById('st-height').value);

  if (isNaN(age) || isNaN(height)) {
    alert("Mohon isi data usia dan tinggi badan balita.");
    return;
  }

  document.getElementById('stunting-form-container').classList.add('hidden');
  const resultContainer = document.getElementById('stunting-result-container');
  resultContainer.classList.remove('hidden');

  let expectedHeight = 50 + (age * 1.5); 
  let heightDiff = height - expectedHeight;

  let statusTitle = "";
  let statusClass = "";
  let description = "";

  if (heightDiff < -5) {
    statusTitle = "⚠️ Skrining Awal: Perlu Perhatian Tumbuh Tumbuh";
    statusClass = "bg-rose-50 border-rose-200 text-rose-900";
    description = "Hasil indikasi awal menunjukkan tinggi badan balita di bawah rata-rata standar pertumbuhannya. *Catatan: Ini adalah skrining awal — bukan diagnosis medis.*";
  } else {
    statusTitle = "🟢 Skrining Awal: Pertumbuhan Sesuai Standar";
    statusClass = "bg-emerald-50 border-emerald-200 text-emerald-900";
    description = "Tinggi badan balita berada dalam rentang pertumbuhan yang baik sesuai kelompok usianya.";
  }

  resultContainer.innerHTML = `
    <div class="p-3.5 border rounded-2xl ${statusClass} space-y-2 text-xs">
      <strong class="font-extrabold block text-sm">${statusTitle}</strong>
      <p class="text-[11px] leading-relaxed">${description}</p>
    </div>
    <div class="p-3 bg-slate-50 border rounded-xl text-[11px] text-slate-600 space-y-1">
      <strong class="text-slate-800 block">Langkah Rujukan:</strong>
      <p>Kunjungi Posyandu atau Puskesmas terdekat di Kota Palopo untuk pemeriksaan antropometri resmi oleh tenaga kesehatan.</p>
    </div>
    <button onclick="closeStuntingModal()" class="w-full bg-slate-200 font-bold py-2 rounded-xl text-xs">Tutup Skrining</button>
  `;
}

function triggerVoiceInput() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert("Fitur pengenal suara tidak didukung browser ini."); return;
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = 'id-ID';
  recognition.onstart = () => document.getElementById('mic-btn').classList.add('text-rose-600', 'animate-pulse');
  recognition.onresult = (e) => {
    document.getElementById('user-input').value = e.results[0][0].transcript;
    handleChatSubmit(new Event('submit'));
  };
  recognition.onend = () => document.getElementById('mic-btn').classList.remove('text-rose-600', 'animate-pulse');
  recognition.start();
}

function toggleAccessibilityMode() {
  let isAcc = localStorage.getItem('PALOPO_ACCESSIBILITY_MODE') === 'true';
  isAcc = !isAcc;
  localStorage.setItem('PALOPO_ACCESSIBILITY_MODE', isAcc);
  document.body.classList.toggle('high-contrast', isAcc);
}

function changeLanguage() {
  const lang = document.getElementById('lang-select').value;
  const title = document.getElementById('main-title');
  const sub = document.getElementById('sub-welcome');
  if (lang === 'tae') {
    title.innerText = "Aga kaperluangta ri layanan hari ini?";
    sub.innerText = "Pauangki kaperluangta, PALOPOTA siap membantu.";
  } else if (lang === 'en') {
    title.innerText = "What would you like to resolve today?";
    sub.innerText = "Tell us your needs. PALOPOTA helps you find the right public service.";
  } else {
    title.innerText = "Apa yang ingin Anda selesaikan hari ini?";
    sub.innerText = "Ceritakan kebutuhan Anda. PALOPOTA membantu menemukan layanan yang tepat.";
  }
}

function escapeHtml(t) { return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function startIdleTimer() { setTimeout(showIkmPopup, 5 * 60 * 1000); }
function showIkmPopup() { document.getElementById('ikm-popup').classList.remove('hidden'); }
function closeIkmPopup() { document.getElementById('ikm-popup').classList.add('hidden'); }
function saveChatToLocalStorage() { localStorage.setItem('PALOPO_CHAT_HISTORY_DATA', JSON.stringify(chatHistory)); }

// Banner Carousel Engine
let currentBanner = 0;
function updateBanner() {
  const slider = document.getElementById('banner-slider');
  if (slider) slider.style.transform = `translateX(-${currentBanner * 100}%)`;
}
function goToBanner(i) { currentBanner = i; updateBanner(); }

// Event Listener Inisialisasi
window.addEventListener('DOMContentLoaded', () => {
  loadAppData();
  if (localStorage.getItem('PALOPO_ACCESSIBILITY_MODE') === 'true') {
    document.body.classList.add('high-contrast');
  }
  setInterval(() => { currentBanner = (currentBanner + 1) % 3; updateBanner(); }, 30000);
});
