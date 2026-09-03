let servicesCatalog = [];

// Memuat data katalog layanan dari JSON
async function loadServicesCatalog() {
  try {
    const res = await fetch('data/services.json');
    servicesCatalog = await res.json();
  } catch (err) {
    console.error("Gagal memuat data services.json:", err);
  }
}

// Mencari layanan yang cocok berdasarkan kata kunci input pengguna
function findMatchingService(userInput) {
  if (!servicesCatalog || servicesCatalog.length === 0) return null;
  
  const text = userInput.toLowerCase();
  
  return servicesCatalog.find(service => 
    service.keywords.some(keyword => text.includes(keyword))
  );
}

// Merender Direct Action Card untuk dimasukkan ke dalam obrolan AI
function renderServiceActionCard(service) {
  let reqsList = service.requirements.map(r => `<li>• ${r}</li>`).join('');

  return `
    <div class="mt-2 p-3 bg-slate-50 border border-brand-blue/30 rounded-xl space-y-2 text-xs">
      <div class="flex items-center justify-between border-b border-slate-200 pb-1.5">
        <strong class="text-brand-navy font-extrabold flex items-center">
          <i class="fa-solid fa-compass-drafting text-brand-blue mr-1.5"></i> ${service.title}
        </strong>
        <span class="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">${service.cost}</span>
      </div>

      <div class="grid grid-cols-2 gap-1 text-[10px] text-slate-600">
        <div><strong>Penanggung Jawab:</strong> ${service.opd}</div>
        <div><strong>Estimasi Waktu:</strong> ${service.duration}</div>
      </div>

      <div class="text-[10px] text-slate-600">
        <strong class="block text-slate-700 mb-0.5">Persyaratan Utama:</strong>
        <ul class="pl-1 space-y-0.5 text-slate-500">${reqsList}</ul>
      </div>

      <div class="pt-1 flex gap-1.5">
        <a href="${service.mapsUrl}" target="_blank" class="flex-1 bg-white border border-slate-300 text-slate-700 font-bold py-1.5 rounded-lg text-[10px] text-center hover:bg-slate-100">
          <i class="fa-solid fa-map-pin text-rose-500 mr-1"></i> Lokasi Kantor
        </a>
        <button onclick="sendQuickPrompt('Bagaimana alur detail pengurusan ${service.title}?')" class="flex-1 bg-brand-navy text-white font-bold py-1.5 rounded-lg text-[10px] text-center hover:bg-slate-800">
          <i class="fa-solid fa-circle-info mr-1"></i> Detail Alur
        </button>
      </div>
    </div>
  `;
}

// Inisialisasi saat file dimuat
window.addEventListener('DOMContentLoaded', () => {
  loadServicesCatalog();
});
