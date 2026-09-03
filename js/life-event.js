let lifeEventsData = [];

// Memuat data skenario life events dari JSON
async function loadLifeEventsData() {
  try {
    const res = await fetch('data/life-events.json');
    lifeEventsData = await res.json();
  } catch (err) {
    console.error("Gagal memuat data life-events.json:", err);
  }
}

// Merender daftar dan detail skenario Life Event ke dalam Modal
function renderLifeEventModal() {
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');
  
  if (!title || !body) return;

  title.innerText = "🧭 Life Event Engine (Panduan Terpadu)";

  if (!lifeEventsData || lifeEventsData.length === 0) {
    body.innerHTML = `<p class="text-xs text-slate-500">Memuat skenario layanan terpadu...</p>`;
    return;
  }

  let html = `<p class="text-xs text-slate-600 mb-3">Pilih peristiwa kehidupan yang sedang Anda alami untuk melihat panduan langkah lintas-OPD:</p>`;
  html += `<div class="space-y-3">`;

  lifeEventsData.forEach(event => {
    html += `
      <div class="p-3.5 border rounded-2xl bg-white border-slate-200 hover:border-brand-blue transition shadow-sm">
        <div class="flex items-center space-x-2.5 mb-2">
          <div class="w-8 h-8 rounded-xl bg-${event.color}-100 text-${event.color}-600 flex items-center justify-center text-sm font-bold shrink-0">
            <i class="fa-solid ${event.icon}"></i>
          </div>
          <div>
            <h4 class="font-extrabold text-brand-navy text-xs">${event.title}</h4>
            <p class="text-[10px] text-slate-500">${event.description}</p>
          </div>
        </div>

        <!-- Timeline Alur Langkah -->
        <div class="space-y-2 mt-2 pt-2 border-t border-slate-100">
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Alur Pengurusan Lintas Dinas:</span>
    `;

    event.steps.forEach((step, idx) => {
      let docsList = step.docs.map(d => `<li>• ${d}</li>`).join('');
      html += `
        <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 text-[11px] space-y-1">
          <div class="flex items-center justify-between font-bold text-slate-800">
            <span class="text-brand-blue">Langkah ${idx + 1}: ${step.opd}</span>
          </div>
          <p class="text-slate-700 font-medium">${step.action}</p>
          <div class="text-[10px] text-slate-500 pt-0.5">
            <span class="font-semibold block text-slate-600">Berkas yang disiapkan:</span>
            <ul class="pl-1 space-y-0.5 text-slate-500">${docsList}</ul>
          </div>
        </div>
      `;
    });

    html += `
        </div>
        <button onclick="askAI('Bantu saya urus skenario ${event.title}')" class="w-full mt-2.5 bg-brand-navy hover:bg-slate-800 text-white font-bold py-2 rounded-xl text-xs transition shadow-sm flex items-center justify-center space-x-1">
          <i class="fa-solid fa-robot text-[10px]"></i>
          <span>Pandu Saya via AI</span>
        </button>
      </div>
    `;
  });

  html += `</div>`;
  body.innerHTML = html;
}

// Inisialisasi saat file dimuat
window.addEventListener('DOMContentLoaded', () => {
  loadLifeEventsData();
});
