const USERNAME = "faisal";
const PASSWORD = "yahya";
const ADMIN_PASSWORD = "2782003";
const STORAGE_KEY = "garment_tracker_data_v2";
const OLD_STORAGE_KEY = "garment_tracker_data_v1";
const REMEMBER_KEY = "garment_tracker_remembered";
const SESSION_KEY = "garment_tracker_logged_in";

const app = document.querySelector("#app");

let state = {
  garments: [],
  buyers: []
};

let searchTerm = "";
let stockFilter = "all";
let sortMode = "newest";
let selectedGarmentId = null;

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(OLD_STORAGE_KEY);
  if (!saved) return;

  try {
    state = JSON.parse(saved);
    migrateState();
    saveState();
  } catch {
    state = { garments: [], buyers: [] };
  }
}

function migrateState() {
  state.garments = (state.garments || []).map((garment) => {
    const history = (garment.history || []).map((item) => ({
      id: item.id || crypto.randomUUID(),
      type: item.type || "sale",
      buyer: item.buyer || "",
      yards: Number(item.yards || 0),
      note: item.note || "",
      date: item.date || new Date().toISOString()
    }));
    const sold = history
      .filter((item) => item.type === "sale")
      .reduce((sum, item) => sum + Number(item.yards || 0), 0);
    const restocked = history
      .filter((item) => item.type === "restock")
      .reduce((sum, item) => sum + Number(item.yards || 0), 0);
    const initialYards = Number(garment.initialYards || (Number(garment.yards || 0) + sold - restocked));

    return {
      id: garment.id || crypto.randomUUID(),
      name: garment.name || "",
      code: garment.code || "",
      yards: Number(garment.yards || 0),
      initialYards: Math.max(initialYards, Number(garment.yards || 0)),
      image: garment.image || "",
      notes: garment.notes || "",
      createdAt: garment.createdAt || new Date().toISOString(),
      history
    };
  });

  state.buyers = [...new Set([
    ...(state.buyers || []),
    ...state.garments.flatMap((garment) => garment.history.map((item) => item.buyer).filter(Boolean))
  ])].sort((a, b) => a.localeCompare(b, "ar"));
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function isLoggedIn() {
  return sessionStorage.getItem(SESSION_KEY) === "yes" || localStorage.getItem(REMEMBER_KEY) === "yes";
}

function setLoggedIn(remember) {
  sessionStorage.setItem(SESSION_KEY, "yes");
  if (remember) {
    localStorage.setItem(REMEMBER_KEY, "yes");
  } else {
    localStorage.removeItem(REMEMBER_KEY);
  }
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  renderLogin();
}

function moneyNumber(value) {
  return new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function stockClass(yards) {
  if (yards <= 30) return "stock-red";
  if (yards < 150) return "stock-yellow";
  return "stock-green";
}

function stockLabel(yards) {
  if (yards <= 30) return "قارب على النفاد";
  if (yards < 150) return "مخزون منخفض";
  return "متوفر";
}

function totalYards() {
  return state.garments.reduce((sum, garment) => sum + Number(garment.yards || 0), 0);
}

function totalSold() {
  return state.garments.reduce((sum, garment) => {
    return sum + garment.history
      .filter((item) => item.type === "sale")
      .reduce((inner, item) => inner + Number(item.yards || 0), 0);
  }, 0);
}

function lowStockCount() {
  return state.garments.filter((garment) => Number(garment.yards || 0) <= 30).length;
}

function buyerTotals() {
  const totals = new Map();
  state.garments.forEach((garment) => {
    garment.history
      .filter((item) => item.type === "sale")
      .forEach((item) => {
        const current = totals.get(item.buyer) || {
          buyer: item.buyer,
          yards: 0,
          count: 0,
          garmentCount: 0,
          garments: new Map(),
          lastDate: item.date
        };
        current.yards += Number(item.yards || 0);
        current.count += 1;
        current.garments.set(garment.id, {
          name: garment.name,
          code: garment.code,
          yards: (current.garments.get(garment.id)?.yards || 0) + Number(item.yards || 0)
        });
        current.garmentCount = current.garments.size;
        if (new Date(item.date) > new Date(current.lastDate)) current.lastDate = item.date;
        totals.set(item.buyer, current);
      });
  });

  return [...totals.values()]
    .map((item) => ({ ...item, garments: [...item.garments.values()].sort((a, b) => b.yards - a.yards) }))
    .sort((a, b) => b.yards - a.yards);
}

function buyerBreakdown(buyer) {
  const rows = [];
  state.garments.forEach((garment) => {
    const sales = garment.history
      .filter((item) => item.type === "sale" && item.buyer === buyer)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const yards = sales.reduce((sum, item) => sum + Number(item.yards || 0), 0);
    if (yards > 0) rows.push({ garment, yards, sales });
  });
  return rows.sort((a, b) => b.yards - a.yards);
}

function recentActivity(limit = 8) {
  return state.garments
    .flatMap((garment) => garment.history.map((item) => ({ ...item, garmentName: garment.name, code: garment.code })))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, limit);
}

function buyerOptions() {
  return state.buyers
    .map((buyer) => `<option value="${escapeHtml(buyer)}"></option>`)
    .join("");
}

function requireAdminPassword(actionName) {
  const password = prompt(`أدخل كلمة مرور الإدارة من أجل ${actionName}`);
  if (password === null) return false;
  if (password === ADMIN_PASSWORD) return true;

  alert("كلمة مرور الإدارة غير صحيحة.");
  return false;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderLogin() {
  app.innerHTML = `
    <section class="login-page">
      <div class="login-box">
        <h1>hasinah garments</h1>
        <p>سجل الدخول لإدارة الأقمشة، الأكواد، الكميات، وسجل العملاء.</p>
        <form class="form" id="loginForm">
          <label>
            اسم المستخدم
            <input id="username" autocomplete="username" required>
          </label>
          <label>
            كلمة المرور
            <input id="password" type="password" autocomplete="current-password" required>
          </label>
          <label class="check-row">
            <input id="remember" type="checkbox">
            تذكرني
          </label>
          <p class="error" id="loginError"></p>
          <button class="primary-btn" type="submit">دخول</button>
        </form>
      </div>
    </section>
  `;

  document.querySelector("#loginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const username = document.querySelector("#username").value.trim();
    const password = document.querySelector("#password").value;
    const remember = document.querySelector("#remember").checked;

    if (username === USERNAME && password === PASSWORD) {
      setLoggedIn(remember);
      renderApp();
      return;
    }

    document.querySelector("#loginError").textContent = "اسم المستخدم أو كلمة المرور غير صحيحة.";
  });
}

function getFilteredGarments() {
  return state.garments
    .filter((garment) => {
      const text = `${garment.name} ${garment.code} ${garment.notes}`.toLowerCase();
      return text.includes(searchTerm.toLowerCase());
    })
    .filter((garment) => {
      const yards = Number(garment.yards || 0);
      if (stockFilter === "available") return yards >= 150;
      if (stockFilter === "low") return yards < 150 && yards > 30;
      if (stockFilter === "critical") return yards <= 30;
      return true;
    })
    .sort((a, b) => {
      if (sortMode === "name") return a.name.localeCompare(b.name, "ar");
      if (sortMode === "highest") return Number(b.yards || 0) - Number(a.yards || 0);
      if (sortMode === "lowest") return Number(a.yards || 0) - Number(b.yards || 0);
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
}

function renderApp() {
  const filtered = getFilteredGarments();

  app.innerHTML = `
    <section class="shell">
      <header class="topbar">
        <div class="brand">
          <span>hasinah garments</span>
          <small>فكرة وتخطيط العم فيصل</small>
        </div>
        <div class="top-actions">
          <button class="secondary-btn" id="exportBtn">تصدير CSV</button>
          <button class="secondary-btn" id="logoutBtn">تسجيل الخروج</button>
        </div>
      </header>

      <main class="content">
        <section class="page-title">
          <h1>المخزون</h1>
          <p>تابع القماش من الشراء إلى البيع، واعرف الكمية المتبقية لكل كود وكم أخذ كل عميل.</p>
        </section>

        <section class="stats-grid" aria-label="ملخص المخزون">
          <div class="stat"><span>عدد الأقمشة</span><strong>${moneyNumber(state.garments.length)}</strong></div>
          <div class="stat"><span>الياردات المتبقية</span><strong>${moneyNumber(totalYards())}</strong></div>
          <div class="stat"><span>الياردات المباعة</span><strong>${moneyNumber(totalSold())}</strong></div>
          <div class="stat alert-stat"><span>قارب على النفاد</span><strong>${moneyNumber(lowStockCount())}</strong></div>
        </section>

        <section class="toolbar">
          <label>
            بحث بالاسم أو الكود أو الملاحظات
            <input id="searchInput" value="${escapeHtml(searchTerm)}" placeholder="اكتب اسم القماش أو كود المصنع">
          </label>
          <label>
            حالة المخزون
            <select id="stockFilter">
              <option value="all" ${stockFilter === "all" ? "selected" : ""}>الكل</option>
              <option value="available" ${stockFilter === "available" ? "selected" : ""}>متوفر</option>
              <option value="low" ${stockFilter === "low" ? "selected" : ""}>منخفض</option>
              <option value="critical" ${stockFilter === "critical" ? "selected" : ""}>قارب على النفاد</option>
            </select>
          </label>
          <label>
            ترتيب
            <select id="sortMode">
              <option value="newest" ${sortMode === "newest" ? "selected" : ""}>الأحدث</option>
              <option value="name" ${sortMode === "name" ? "selected" : ""}>الاسم</option>
              <option value="highest" ${sortMode === "highest" ? "selected" : ""}>الكمية الأعلى</option>
              <option value="lowest" ${sortMode === "lowest" ? "selected" : ""}>الكمية الأقل</option>
            </select>
          </label>
          <button class="primary-btn" id="addGarmentBtn">+ إضافة قماش</button>
        </section>

        <section class="garment-grid">
          ${filtered.length ? filtered.map(renderCard).join("") : `<div class="empty">لا توجد أقمشة مطابقة.</div>`}
        </section>

        <section class="dashboard-grid">
          <section class="buyers-panel">
            <div>
              <h2>ملفات العملاء</h2>
              <p>كل عميل له بطاقة خاصة. اضغط عليها لمعرفة كم يارد أخذ من كل قماش.</p>
            </div>
            <div class="buyer-list">
              ${renderBuyerTotals()}
            </div>
          </section>

          <section class="buyers-panel">
            <div>
              <h2>آخر الحركات</h2>
              <p>أحدث عمليات البيع وإضافة المخزون.</p>
            </div>
            <div class="activity-list">
              ${renderRecentActivity()}
            </div>
          </section>
        </section>

        <footer class="site-credit">حقوق يحيى المفلحي شركة ركن حسينة</footer>
      </main>
    </section>

    <div id="modalRoot"></div>
  `;

  document.querySelector("#logoutBtn").addEventListener("click", logout);
  document.querySelector("#exportBtn").addEventListener("click", exportCsv);
  document.querySelector("#addGarmentBtn").addEventListener("click", openAddModal);
  document.querySelector("#searchInput").addEventListener("input", (event) => {
    searchTerm = event.target.value;
    renderApp();
    document.querySelector("#searchInput").focus();
  });
  document.querySelector("#stockFilter").addEventListener("change", (event) => {
    stockFilter = event.target.value;
    renderApp();
  });
  document.querySelector("#sortMode").addEventListener("change", (event) => {
    sortMode = event.target.value;
    renderApp();
  });

  document.querySelectorAll(".garment-card").forEach((card) => {
    card.addEventListener("click", () => openDetailModal(card.dataset.id));
  });
  document.querySelectorAll(".buyer-row").forEach((row) => {
    row.addEventListener("click", () => openBuyerModal(row.dataset.buyer));
  });
}

function renderBuyerTotals() {
  const totals = buyerTotals();
  if (!totals.length) return `<div class="empty">سيظهر العملاء هنا بعد أول عملية بيع.</div>`;

  return totals.map((item) => `
    <button class="buyer-row buyer-profile" data-buyer="${escapeHtml(item.buyer)}" aria-label="فتح ملف ${escapeHtml(item.buyer)}">
      <span class="buyer-avatar">${escapeHtml(item.buyer.trim().slice(0, 1) || "ع")}</span>
      <span class="buyer-info">
        <strong>${escapeHtml(item.buyer)}</strong>
        <small>${moneyNumber(item.garmentCount)} نوع قماش - ${moneyNumber(item.count)} عملية</small>
        <span class="buyer-garments">${renderBuyerGarmentPreview(item.garments)}</span>
      </span>
      <span class="buyer-total">${moneyNumber(item.yards)} يارد</span>
    </button>
  `).join("");
}

function renderBuyerGarmentPreview(garments) {
  return garments.slice(0, 3).map((garment) => `
    <b>${escapeHtml(garment.name)}: ${moneyNumber(garment.yards)} يارد</b>
  `).join("") + (garments.length > 3 ? `<b>+${moneyNumber(garments.length - 3)} أخرى</b>` : "");
}

function renderRecentActivity() {
  const activity = recentActivity();
  if (!activity.length) return `<div class="empty">لا توجد حركات بعد.</div>`;

  return activity.map((item) => `
    <div class="activity-item">
      <span class="pill ${item.type === "restock" ? "pill-green" : "pill-blue"}">${item.type === "restock" ? "إضافة" : "بيع"}</span>
      <div>
        <strong>${escapeHtml(item.garmentName)}</strong>
        <small>${item.type === "sale" ? `إلى ${escapeHtml(item.buyer)}` : escapeHtml(item.note || "إضافة مخزون")} - ${new Date(item.date).toLocaleString("ar-SA")}</small>
      </div>
      <b>${moneyNumber(item.yards)} يارد</b>
    </div>
  `).join("");
}

function renderCard(garment) {
  const yards = Number(garment.yards || 0);
  const initial = Math.max(Number(garment.initialYards || yards), yards, 1);
  const percentage = Math.max(0, Math.min(100, (yards / initial) * 100));
  const warning = yards <= 30 ? `<span class="warning" title="قارب على النفاد">!</span>` : "";
  const image = garment.image
    ? `<img class="garment-photo" src="${garment.image}" alt="${escapeHtml(garment.name)}">`
    : `<div class="garment-placeholder">صورة القماش</div>`;

  return `
    <button class="garment-card" data-id="${garment.id}">
      ${image}
      <div class="card-body">
        <div class="card-title">
          <strong>${escapeHtml(garment.name)}</strong>
          ${warning}
        </div>
        <span class="code">كود المصنع: ${escapeHtml(garment.code)}</span>
        <span class="yards ${stockClass(yards)}">${moneyNumber(yards)} يارد متبقي</span>
        <div class="stock-meter" aria-label="نسبة المتبقي">
          <span style="width: ${percentage}%"></span>
        </div>
        <small>${stockLabel(yards)}</small>
      </div>
    </button>
  `;
}

function openAddModal() {
  selectedGarmentId = null;
  document.querySelector("#modalRoot").innerHTML = `
    <section class="modal" role="dialog" aria-modal="true">
      <div class="modal-panel">
        <header class="modal-head">
          <h2>إضافة قماش جديد</h2>
          <button class="icon-btn" id="closeModal" aria-label="إغلاق">×</button>
        </header>
        <form class="modal-body" id="addForm">
          <div class="form-grid">
            <label>
              اسم القماش
              <input id="garmentName" required>
            </label>
            <label>
              كود المصنع
              <input id="garmentCode" required>
            </label>
            <label>
              عدد الياردات
              <input id="garmentYards" type="number" min="0" step="0.01" required>
            </label>
            <label>
              صورة القماش
              <input id="garmentImage" type="file" accept="image/*">
            </label>
            <label class="span-2">
              ملاحظات
              <input id="garmentNotes" placeholder="مثال: لون، نوع خامة، مكان التخزين">
            </label>
          </div>
          <button class="primary-btn" type="submit">حفظ القماش</button>
        </form>
      </div>
    </section>
  `;

  document.querySelector("#closeModal").addEventListener("click", closeModal);
  document.querySelector("#addForm").addEventListener("submit", handleAddGarment);
}

async function handleAddGarment(event) {
  event.preventDefault();
  const file = document.querySelector("#garmentImage").files[0];
  const image = file ? await readImage(file) : "";
  const yards = Number(document.querySelector("#garmentYards").value);

  state.garments.unshift({
    id: crypto.randomUUID(),
    name: document.querySelector("#garmentName").value.trim(),
    code: document.querySelector("#garmentCode").value.trim(),
    yards,
    initialYards: yards,
    image,
    notes: document.querySelector("#garmentNotes").value.trim(),
    createdAt: new Date().toISOString(),
    history: []
  });

  saveState();
  closeModal();
  renderApp();
}

function openDetailModal(id) {
  selectedGarmentId = id;
  const garment = state.garments.find((item) => item.id === id);
  if (!garment) return;

  const yards = Number(garment.yards || 0);
  const image = garment.image
    ? `<img class="detail-photo" src="${garment.image}" alt="${escapeHtml(garment.name)}">`
    : `<div class="detail-photo garment-placeholder">صورة القماش</div>`;

  document.querySelector("#modalRoot").innerHTML = `
    <section class="modal" role="dialog" aria-modal="true">
      <div class="modal-panel wide-modal">
        <header class="modal-head">
          <h2>${escapeHtml(garment.name)}</h2>
          <button class="icon-btn" id="closeModal" aria-label="إغلاق">×</button>
        </header>
        <div class="modal-body">
          <div class="detail-layout">
            ${image}
            <div class="detail-summary">
              <p class="code">كود المصنع: ${escapeHtml(garment.code)}</p>
              <p class="yards ${stockClass(yards)}">${moneyNumber(yards)} يارد متبقي</p>
              <p>${escapeHtml(garment.notes || "لا توجد ملاحظات.")}</p>
              ${yards <= 30 ? `<p class="stock-red">! تنبيه: القماش قارب على النفاد</p>` : ""}
            </div>
          </div>

          <div class="action-grid">
            <form class="quick-form" id="cutForm">
              <h3>بيع / قص قماش</h3>
              <label>
                عدد الياردات المقطوعة
                <input id="cutYards" type="number" min="0.01" max="${yards}" step="0.01" required>
              </label>
              <label>
                اسم العميل
                <input id="buyerName" list="buyersList" required>
                <datalist id="buyersList">${buyerOptions()}</datalist>
              </label>
              <label>
                ملاحظة اختيارية
                <input id="saleNote" placeholder="مثال: رقم الفاتورة أو لون القطعة">
              </label>
              <button class="primary-btn" type="submit">تحديث الكمية</button>
            </form>

            <form class="quick-form" id="restockForm">
              <h3>إضافة مخزون</h3>
              <label>
                عدد الياردات الجديدة
                <input id="restockYards" type="number" min="0.01" step="0.01" required>
              </label>
              <label>
                ملاحظة
                <input id="restockNote" placeholder="مثال: دفعة جديدة أو تعديل جرد">
              </label>
              <button class="secondary-btn" type="submit">إضافة للمخزون</button>
            </form>
          </div>

          <section>
            <div class="section-head">
              <h3>سجل هذا القماش</h3>
              <button class="secondary-btn" id="editGarment">تعديل البيانات</button>
            </div>
            <div class="history">
              ${garment.history.length ? garment.history.map(renderHistoryItem).join("") : `<div class="empty">لا يوجد سجل بعد.</div>`}
            </div>
          </section>

          <button class="danger-btn" id="deleteGarment">حذف القماش</button>
        </div>
      </div>
    </section>
  `;

  document.querySelector("#closeModal").addEventListener("click", closeModal);
  document.querySelector("#cutForm").addEventListener("submit", handleCut);
  document.querySelector("#restockForm").addEventListener("submit", handleRestock);
  document.querySelector("#editGarment").addEventListener("click", () => {
    if (requireAdminPassword("تعديل القماش")) openEditModal(garment.id);
  });
  document.querySelector("#deleteGarment").addEventListener("click", deleteSelectedGarment);
  document.querySelectorAll(".undo-sale").forEach((button) => {
    button.addEventListener("click", () => undoSale(button.dataset.saleId));
  });
  document.querySelectorAll(".delete-sale").forEach((button) => {
    button.addEventListener("click", () => deleteSaleRecord(button.dataset.saleId));
  });
}

function renderHistoryItem(item) {
  const isRestock = item.type === "restock";
  const saleActions = !isRestock ? `
    <div class="history-actions">
      <button class="secondary-btn mini-btn undo-sale" data-sale-id="${item.id}" type="button">تراجع عن البيع</button>
      <button class="danger-btn mini-btn delete-sale" data-sale-id="${item.id}" type="button">حذف السجل</button>
    </div>
  ` : "";

  return `
    <div class="history-item">
      <span>
        <strong>${isRestock ? "إضافة مخزون" : escapeHtml(item.buyer)}</strong>
        <small>${new Date(item.date).toLocaleString("ar-SA")}${item.note ? ` - ${escapeHtml(item.note)}` : ""}</small>
      </span>
      <div class="history-side">
        <strong class="${isRestock ? "stock-green" : ""}">${isRestock ? "+" : "-"}${moneyNumber(item.yards)} يارد</strong>
        ${saleActions}
      </div>
    </div>
  `;
}

function handleCut(event) {
  event.preventDefault();
  const garment = state.garments.find((item) => item.id === selectedGarmentId);
  if (!garment) return;

  const cutYards = Number(document.querySelector("#cutYards").value);
  const buyer = document.querySelector("#buyerName").value.trim();
  const note = document.querySelector("#saleNote").value.trim();

  if (!buyer || cutYards <= 0 || cutYards > Number(garment.yards)) return;

  garment.yards = Number((Number(garment.yards) - cutYards).toFixed(2));
  garment.history.unshift({
    id: crypto.randomUUID(),
    type: "sale",
    buyer,
    yards: cutYards,
    note,
    date: new Date().toISOString()
  });

  rememberBuyer(buyer);
  saveState();
  renderApp();
  openDetailModal(garment.id);
}

function handleRestock(event) {
  event.preventDefault();
  const garment = state.garments.find((item) => item.id === selectedGarmentId);
  if (!garment) return;

  const yards = Number(document.querySelector("#restockYards").value);
  const note = document.querySelector("#restockNote").value.trim();
  if (yards <= 0) return;

  garment.yards = Number((Number(garment.yards) + yards).toFixed(2));
  garment.initialYards = Math.max(Number(garment.initialYards || 0) + yards, garment.yards);
  garment.history.unshift({
    id: crypto.randomUUID(),
    type: "restock",
    buyer: "",
    yards,
    note,
    date: new Date().toISOString()
  });

  saveState();
  renderApp();
  openDetailModal(garment.id);
}

function rememberBuyer(buyer) {
  if (!state.buyers.includes(buyer)) {
    state.buyers.push(buyer);
    state.buyers.sort((a, b) => a.localeCompare(b, "ar"));
  }
}

function openEditModal(id) {
  const garment = state.garments.find((item) => item.id === id);
  if (!garment) return;

  document.querySelector("#modalRoot").innerHTML = `
    <section class="modal" role="dialog" aria-modal="true">
      <div class="modal-panel">
        <header class="modal-head">
          <h2>تعديل القماش</h2>
          <button class="icon-btn" id="closeModal" aria-label="إغلاق">×</button>
        </header>
        <form class="modal-body" id="editForm">
          <div class="form-grid">
            <label>
              اسم القماش
              <input id="editName" value="${escapeHtml(garment.name)}" required>
            </label>
            <label>
              كود المصنع
              <input id="editCode" value="${escapeHtml(garment.code)}" required>
            </label>
            <label class="span-2">
              صورة جديدة
              <input id="editImage" type="file" accept="image/*">
            </label>
            <label class="span-2">
              ملاحظات
              <input id="editNotes" value="${escapeHtml(garment.notes)}">
            </label>
          </div>
          <button class="primary-btn" type="submit">حفظ التعديل</button>
        </form>
      </div>
    </section>
  `;

  document.querySelector("#closeModal").addEventListener("click", () => openDetailModal(id));
  document.querySelector("#editForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = document.querySelector("#editImage").files[0];
    garment.name = document.querySelector("#editName").value.trim();
    garment.code = document.querySelector("#editCode").value.trim();
    garment.notes = document.querySelector("#editNotes").value.trim();
    if (file) garment.image = await readImage(file);
    saveState();
    renderApp();
    openDetailModal(id);
  });
}

function undoSale(saleId) {
  if (!requireAdminPassword("التراجع عن البيع")) return;

  const garment = state.garments.find((item) => item.id === selectedGarmentId);
  if (!garment) return;

  const sale = garment.history.find((item) => item.id === saleId && item.type === "sale");
  if (!sale) return;

  const sure = confirm(`هل تريد التراجع عن بيع ${moneyNumber(sale.yards)} يارد وإرجاعها للمخزون؟`);
  if (!sure) return;

  garment.yards = Number((Number(garment.yards || 0) + Number(sale.yards || 0)).toFixed(2));
  garment.history = garment.history.filter((item) => item.id !== saleId);
  saveState();
  renderApp();
  openDetailModal(garment.id);
}

function deleteSaleRecord(saleId) {
  if (!requireAdminPassword("حذف سجل البيع")) return;

  const garment = state.garments.find((item) => item.id === selectedGarmentId);
  if (!garment) return;

  const sale = garment.history.find((item) => item.id === saleId && item.type === "sale");
  if (!sale) return;

  const sure = confirm("حذف سجل البيع سيزيله من تاريخ العميل فقط ولن يرجع الياردات للمخزون. هل تريد المتابعة؟");
  if (!sure) return;

  garment.history = garment.history.filter((item) => item.id !== saleId);
  saveState();
  renderApp();
  openDetailModal(garment.id);
}

function openBuyerModal(buyer) {
  const rows = buyerBreakdown(buyer);
  const total = rows.reduce((sum, row) => sum + row.yards, 0);
  document.querySelector("#modalRoot").innerHTML = `
    <section class="modal" role="dialog" aria-modal="true">
      <div class="modal-panel wide-modal">
        <header class="modal-head">
          <div>
            <h2>ملف العميل: ${escapeHtml(buyer)}</h2>
            <p class="modal-subtitle">${moneyNumber(total)} يارد من ${moneyNumber(rows.length)} نوع قماش</p>
          </div>
          <button class="icon-btn" id="closeModal" aria-label="إغلاق">×</button>
        </header>
        <div class="modal-body">
          <div class="buyer-breakdown">
            ${rows.map((row) => `
              <div class="buyer-garment-card">
                ${row.garment.image
                  ? `<img src="${row.garment.image}" alt="${escapeHtml(row.garment.name)}">`
                  : `<div class="mini-placeholder">صورة</div>`}
                <div>
                  <div class="section-head compact-head">
                    <span>
                      <strong>${escapeHtml(row.garment.name)}</strong>
                      <small>كود المصنع: ${escapeHtml(row.garment.code)}</small>
                    </span>
                    <b>${moneyNumber(row.yards)} يارد</b>
                  </div>
                  <div class="mini-history">
                    ${row.sales.map((sale) => `
                      <span>
                        <small>${new Date(sale.date).toLocaleString("ar-SA")}${sale.note ? ` - ${escapeHtml(sale.note)}` : ""}</small>
                        <b>${moneyNumber(sale.yards)} يارد</b>
                      </span>
                    `).join("")}
                  </div>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    </section>
  `;

  document.querySelector("#closeModal").addEventListener("click", closeModal);
}

function deleteSelectedGarment() {
  const garment = state.garments.find((item) => item.id === selectedGarmentId);
  if (!garment) return;

  if (!requireAdminPassword("حذف القماش")) return;

  const sure = confirm(`هل تريد حذف ${garment.name}؟`);
  if (!sure) return;

  state.garments = state.garments.filter((item) => item.id !== selectedGarmentId);
  saveState();
  closeModal();
  renderApp();
}

function exportCsv() {
  try {
    const rows = [
      ["section", "type", "garment", "code", "yards_left", "buyer", "movement_yards", "note", "date"],
      ...state.garments.map((garment) => [
        "inventory",
        "stock",
        garment.name,
        garment.code,
        garment.yards,
        "",
        "",
        garment.notes,
        garment.createdAt
      ]),
      ...state.garments.flatMap((garment) => garment.history.map((item) => [
        "history",
        item.type,
        garment.name,
        garment.code,
        garment.yards,
        item.buyer,
        item.yards,
        item.note,
        item.date
      ]))
    ];

    const csv = `sep=,\n${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `amo-yahya-garments-${today}.csv`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    alert("تم تجهيز ملف CSV. إذا لم يظهر التحميل، تأكد أن المتصفح يسمح بالتنزيلات.");
  } catch (error) {
    alert("تعذر تصدير ملف CSV. حاول مرة أخرى.");
  }
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function closeModal() {
  const modalRoot = document.querySelector("#modalRoot");
  if (modalRoot) modalRoot.innerHTML = "";
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

loadState();
if (isLoggedIn()) {
  renderApp();
} else {
  renderLogin();
}
