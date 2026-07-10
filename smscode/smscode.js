let apiConfig = JSON.parse(localStorage.getItem('smscode_api_config')) || { baseUrl: "https://shopee-otp-proxy.masreno6pro.workers.dev", accountName: "" };
let BASE_URL = apiConfig.baseUrl; 
let activeAccountName = apiConfig.accountName;

const notifSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
const firebaseConfig = { apiKey: "AIzaSyD8oux4DDAE8xB5EaQpnlhosUkK3HVlWL0", authDomain: "catatanku-app-ce60b.firebaseapp.com", databaseURL: "https://catatanku-app-ce60b-default-rtdb.asia-southeast1.firebasedatabase.app", projectId: "catatanku-app-ce60b" };
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let appSettings = JSON.parse(localStorage.getItem('app_settings')) || { password: "Aku123..", autoCopy: true };
let viewingPresenceRef = null; let activeOrders = []; let availableProducts = []; let selectedProductId = null; let timerInterval = null; let pollingInterval = null;
let orderHistory = []; let usedNumbersDB = new Set(); let isUsedNumbersLoaded = false; 

const productList = document.getElementById('productList'); const btnOrder = document.getElementById('btnOrder'); const activeOrdersContainer = document.getElementById('activeOrdersContainer'); const activeCount = document.getElementById('activeCount'); const balanceDisplay = document.getElementById('balanceDisplay'); const exitModal = document.getElementById('exitModal'); 

// ==========================================
// 🚀 DEEP SCANNER (Pencari Angka Universal)
// ==========================================
function extractNumber(val) {
    if (val === undefined || val === null || val === '') return null;
    if (typeof val === 'number') return val;
    let str = String(val).trim().replace(/[Rp\sA-Za-z]/g, '');
    if (str.includes('.') && str.split('.')[1].length === 3) str = str.replace(/\./g, '');
    if (str.includes(',') && str.split(',')[1].length === 3) str = str.replace(/,/g, '');
    let num = parseFloat(str); return isNaN(num) ? null : num;
}

function getAnyNumber(obj, keywords) {
    if (!obj || typeof obj !== 'object') return null;
    for (let k of Object.keys(obj)) {
        if (keywords.some(kw => k.toLowerCase().includes(kw))) {
            let num = extractNumber(obj[k]); if (num !== null) return num;
        }
    }
    for (let k of Object.keys(obj)) {
        if (typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
            let num = getAnyNumber(obj[k], keywords); if (num !== null) return num;
        }
    }
    return null;
}
// ==========================================

window.openApiModal = function() { document.getElementById('apiBaseUrl').value = apiConfig.baseUrl; document.getElementById('apiAccountName').value = apiConfig.accountName; document.getElementById('apiModal').classList.remove('hidden'); history.pushState(null, null, "#api"); }
window.closeApiModal = function() { document.getElementById('apiModal').classList.add('hidden'); }

window.saveApiConfig = function() {
    const newBase = document.getElementById('apiBaseUrl').value.trim(); const newAcc = document.getElementById('apiAccountName').value.trim();
    if (!newBase || !newAcc) return showToast("Semua kolom API harus diisi!", "error");
    
    apiConfig.baseUrl = newBase; apiConfig.accountName = newAcc;
    localStorage.setItem('smscode_api_config', JSON.stringify(apiConfig)); BASE_URL = newBase;
    
    closeApiModal(); showToast("API dikoneksikan!");
    if (timerInterval) clearInterval(timerInterval); if (pollingInterval) clearInterval(pollingInterval);
    setAccountViewingStatus(false);
    
    if (activeOrdersContainer) activeOrdersContainer.innerHTML = '<div class="status-text">Memuat pesanan...</div>';
    if (balanceDisplay) balanceDisplay.innerText = "..."; 
    loginAccount(newAcc);
}

function openSettingsModal() { document.getElementById('settingsPassword').value = appSettings.password; document.getElementById('settingsAutoCopy').checked = appSettings.autoCopy; document.getElementById('settingsModal').classList.remove('hidden'); history.pushState(null, null, "#settings"); }
function closeSettingsModal() { document.getElementById('settingsModal').classList.add('hidden'); }
window.saveSettings = function() { appSettings.password = document.getElementById('settingsPassword').value; appSettings.autoCopy = document.getElementById('settingsAutoCopy').checked; localStorage.setItem('app_settings', JSON.stringify(appSettings)); closeSettingsModal(); showToast("Pengaturan disimpan!"); renderMainButtons(); }

function renderMainButtons() { const extraBtnWrapper = document.getElementById('extraBtnWrapper'); if (!extraBtnWrapper) return; if (appSettings.autoCopy) { extraBtnWrapper.innerHTML = `<button onclick="copyToClipboard('${appSettings.password}')" class="btn-primary" style="background-color: var(--info-color); margin-top: 12px; width: 100%; border-radius: 12px;"><i class="fas fa-copy"></i> Salin Sandi</button>`; } else { extraBtnWrapper.innerHTML = `<button class="btn-primary" disabled style="background-color: var(--bg-card); color: var(--text-secondary); margin-top: 12px; width: 100%; border-radius: 12px;"><i class="fas fa-check"></i> Selesai (Nonaktif)</button>`; } }
function normalizePhone(phone) { if (!phone) return ""; let p = String(phone).replace(/\D/g, ""); if (p.startsWith("0")) { p = "62" + p.substring(1); } return p; }
function formatPhoneNumber(phone) { if (!phone) return ""; let p = String(phone); if (p.startsWith("62")) { p = "0" + p.substring(2); } return p.replace(/(.{4})/g, '$1 ').trim(); }
function formatOTP(otp) { if (!otp) return ""; const otpStr = String(otp); if (otpStr.length >= 6) { return otpStr.slice(0, 3) + "&nbsp;&nbsp;" + otpStr.slice(3); } return otpStr; }
function getProviderName(phone) { let p = String(phone); if (p.startsWith("62")) p = "0" + p.substring(2); const prefix = p.substring(0, 4); if (['0811','0812','0813','0821','0822','0852','0853','0851'].includes(prefix)) return "Telkomsel"; if (['0814','0815','0816','0855','0856','0857','0858'].includes(prefix)) return "Indosat"; if (['0817','0818','0819','0859','0877','0878','0838','0831','0832','0833'].includes(prefix)) return "XL/Axis"; if (['0895','0896','0897','0898','0899'].includes(prefix)) return "Tri"; if (['0881','0882','0883','0884','0885','0886','0887','0888','0889'].includes(prefix)) return "Smartfren"; return "Acak"; }

function relocateBalanceUI() { const headerContainer = document.querySelector('.app-header-container'); const balanceContainer = document.querySelector('.balance-container'); if(headerContainer && balanceContainer && !document.getElementById('newBalanceDisplay')) { balanceContainer.style.display = 'none'; const newBalanceDiv = document.createElement('div'); newBalanceDiv.style.textAlign = 'right'; newBalanceDiv.innerHTML = `<span style="font-size: 11px; color: var(--text-secondary); font-weight: bold; text-transform: uppercase; display: block;">Saldo</span><span id="newBalanceDisplay" style="font-size: 18px; font-weight: 900; color: var(--primary-color);">...</span>`; headerContainer.appendChild(newBalanceDiv); const oldBalance = document.getElementById('balanceDisplay'); if(oldBalance) oldBalance.removeAttribute('id'); newBalanceDiv.querySelector('span:last-child').id = 'balanceDisplay'; } }

let isExitModalOpen = false;
window.addEventListener('popstate', (e) => {
    const blM = document.getElementById('blacklistModal'); const histM = document.getElementById('historyModal'); const statsM = document.getElementById('statsModal'); const setM = document.getElementById('settingsModal'); const apiM = document.getElementById('apiModal');
    if (blM && !blM.classList.contains('hidden')) { window.closeBlacklistModal(); history.pushState(null, null, window.location.href); } else if (histM && !histM.classList.contains('hidden')) { window.closeHistoryModal(); history.pushState(null, null, window.location.href); } else if (statsM && !statsM.classList.contains('hidden')) { window.closeStatsModal(); history.pushState(null, null, window.location.href); } else if (setM && !setM.classList.contains('hidden')) { window.closeSettingsModal(); history.pushState(null, null, window.location.href); } else if (apiM && !apiM.classList.contains('hidden')) { window.closeApiModal(); history.pushState(null, null, window.location.href); } else if (isExitModalOpen) { closeExitModal(); history.pushState(null, null, window.location.href); } else { exitModal.classList.remove('hidden'); isExitModalOpen = true; history.pushState(null, null, window.location.href); }
});
function closeExitModal() { exitModal.classList.add('hidden'); isExitModalOpen = false; }
function confirmExit() { setAccountViewingStatus(false); window.close(); if (navigator.app) navigator.app.exitApp(); else if (navigator.device) navigator.device.exitApp(); else window.history.go(-2); }
function setAccountViewingStatus(isViewing) { if (!activeAccountName) return; if (isViewing) { const connectedRef = db.ref('.info/connected'); viewingPresenceRef = db.ref(`presence/${activeAccountName}/is_viewing`); connectedRef.on('value', (snap) => { if (snap.val() === true) { viewingPresenceRef.onDisconnect().set(false); viewingPresenceRef.set(true); } }); } else { if (viewingPresenceRef) { viewingPresenceRef.set(false); viewingPresenceRef.onDisconnect().cancel(); } } }
function updateAccountOrdersStatus() { if (!activeAccountName) return; db.ref(`presence/${activeAccountName}/has_orders`).set(activeOrders.length > 0); }
function initUsedNumbersSync() { db.ref('used_numbers/smscode').on('value', snapshot => { usedNumbersDB.clear(); let operatorCounts = {}; let totalBlacklist = 0; if (snapshot.exists()) { snapshot.forEach(child => { if (child.val().phone) { let normalPhone = normalizePhone(child.val().phone); usedNumbersDB.add(normalPhone); totalBlacklist++; let op = getProviderName(normalPhone); operatorCounts[op] = (operatorCounts[op] || 0) + 1; } }); } isUsedNumbersLoaded = true; if(document.getElementById('blacklistBadge')) document.getElementById('blacklistBadge').innerText = totalBlacklist; if(document.getElementById('blacklistDetailCount')) document.getElementById('blacklistDetailCount').innerText = totalBlacklist; let breakdownText = ""; for (let op in operatorCounts) { breakdownText += `<span style="display:inline-block; background:var(--bg-card); padding:4px 10px; border-radius:10px; margin:4px; font-size:11px; font-weight:bold; color:var(--text-primary); border: 1px solid var(--border-color);">${op}: ${operatorCounts[op]}</span>`; } let breakdownDiv = document.getElementById('operatorBreakdown'); if(!breakdownDiv) { breakdownDiv = document.createElement('div'); breakdownDiv.id = 'operatorBreakdown'; breakdownDiv.style.marginTop = "15px"; breakdownDiv.style.textAlign = "center"; const targetParent = document.querySelector('#blacklistModal .modal-content p:last-of-type').parentNode; if(targetParent) targetParent.appendChild(breakdownDiv); } breakdownDiv.innerHTML = breakdownText; }); }
function recordStat(type) { const today = new Date().toLocaleDateString('en-CA'); const statRef = db.ref(`stats/smscode/${today}/${type}`); statRef.transaction(currentCount => (currentCount || 0) + 1); }
window.openStatsModal = function() { document.getElementById('statsModal').classList.remove('hidden'); const dateInput = document.getElementById('statDate'); if(!dateInput.value) dateInput.value = new Date().toLocaleDateString('en-CA'); loadStatsData(); history.pushState(null, null, "#stats"); }
window.closeStatsModal = function() { document.getElementById('statsModal').classList.add('hidden'); }
function loadStatsData() { const selectedDate = document.getElementById('statDate').value; const sSuccess = document.getElementById('statSuccess'); const sFailed = document.getElementById('statFailed'); if(sSuccess) sSuccess.innerText = "..."; if(sFailed) sFailed.innerText = "..."; db.ref(`stats/smscode/${selectedDate}`).once('value', snap => { const data = snap.val(); if(sSuccess) sSuccess.innerText = data?.success || 0; if(sFailed) sFailed.innerText = data?.failed || 0; }); }
document.getElementById('statDate').addEventListener('change', loadStatsData);
window.openBlacklistModal = function() { document.getElementById('blacklistModal').classList.remove('hidden'); history.pushState(null, null, "#blacklist"); }
window.closeBlacklistModal = function() { document.getElementById('blacklistModal').classList.add('hidden'); }
function loadHistory() { orderHistory = JSON.parse(localStorage.getItem(`smscode_history_${activeAccountName}`)) || []; renderHistory(); }
function saveToHistory(order, status) { if (!order) return; const historyItem = { id: order.id, phone: order.phone, op: order.productId, price: order.price, otp: order.otp || "-", status: status, date: Date.now() }; orderHistory.unshift(historyItem); if (orderHistory.length > 50) orderHistory.pop(); localStorage.setItem(`smscode_history_${activeAccountName}`, JSON.stringify(orderHistory)); renderHistory(); }
function renderHistory() { const list = document.getElementById('history-list'); if (!list) return; if (orderHistory.length === 0) { list.innerHTML = '<div class="status-text">Belum ada riwayat pesanan.</div>'; return; } list.innerHTML = ""; orderHistory.forEach(item => { const card = document.createElement('div'); card.style.background = "var(--bg-card)"; card.style.padding = "12px"; card.style.borderRadius = "10px"; card.style.border = "1px solid var(--border-color)"; card.style.fontSize = "12px"; let statusColor = "var(--text-secondary)"; let icon = "fa-clock"; if (item.status === "SUKSES") { statusColor = "var(--success-color)"; icon = "fa-check-circle"; } if (item.status === "BATAL") { statusColor = "var(--danger-color)"; icon = "fa-times-circle"; } if (item.status === "GANTI") { statusColor = "var(--warning-color)"; icon = "fa-sync-alt"; } if (item.status === "MINTA ULANG") { statusColor = "var(--info-color)"; icon = "fa-envelope"; } const opTag = getProviderName(item.phone); const dt = new Date(item.date); const timeStr = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')} - ${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`; card.innerHTML = `<div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><strong style="color: var(--text-primary); font-size: 14px; letter-spacing: 1px;">${formatPhoneNumber(item.phone)} <span style="font-size:10px; font-weight:normal; color:var(--text-secondary);">(${opTag})</span></strong><span style="color: ${statusColor}; font-weight: 800;"><i class="fas ${icon}"></i> ${item.status}</span></div><div style="display: flex; justify-content: space-between; color: var(--text-secondary); font-size: 11px; margin-bottom: ${item.status === 'SUKSES' || item.status === 'MINTA ULANG' ? '8px' : '0'};"><span>ID: #${item.id}</span><span>${timeStr}</span></div>${item.status === 'SUKSES' || item.status === 'MINTA ULANG' ? `<div style="background: var(--otp-bg); border: 1px dashed ${statusColor}; color: ${statusColor}; padding: 6px; text-align: center; border-radius: 8px; font-weight: 900; letter-spacing: 4px; font-size: 16px; text-shadow: 0 0 10px rgba(249, 115, 22, 0.3);">${item.otp}</div>` : ''}`; list.appendChild(card); }); }
window.openHistoryModal = function() { document.getElementById('historyModal').classList.remove('hidden'); history.pushState(null, null, "#history"); }
window.closeHistoryModal = function() { document.getElementById('historyModal').classList.add('hidden'); }
window.clearHistory = function() { if(confirm("Hapus semua riwayat pesanan?")) { orderHistory = []; localStorage.removeItem(`smscode_history_${activeAccountName}`); renderHistory(); } }

function loginAccount(accountName) { 
    activeAccountName = accountName; 
    const badge = document.getElementById('currentApiBadge');
    if (badge) { const displayAcc = accountName.length > 12 ? accountName.substring(0, 10) + '...' : accountName; badge.innerText = displayAcc; badge.title = accountName; }
    setAccountViewingStatus(true); 
    const now = Date.now(); const rawOrders = JSON.parse(localStorage.getItem(`orders_${accountName}`)) || []; activeOrders = rawOrders.filter(o => o.expiresAt > now); 
    if (rawOrders.length !== activeOrders.length) saveToStorage(); 
    loadHistory(); initMainApp(); 
}

// 🚀 FUNGSI API HYBRID: BISA LAMA & BISA BARU (Universal)
async function apiCall(endpoint, method = "GET", body = null) { 
    const cleanBaseUrl = BASE_URL.replace(/\/+$/, ''); 
    const options = { 
        method: method, 
        headers: { 
            "Content-Type": "application/json"
        } 
    }; 
    
    // Deteksi cerdas: Jika URL adalah proxy lama, gunakan Header lama. Jika tidak, gunakan Header standar modern.
    if (cleanBaseUrl.includes("masreno6pro")) {
        options.headers["X-Account-Name"] = activeAccountName;
    } else {
        options.headers["Authorization"] = `Bearer ${activeAccountName}`;
        options.headers["X-Api-Key"] = activeAccountName;
    }

    if (body) options.body = JSON.stringify(body); 
    
    try {
        const response = await fetch(`${cleanBaseUrl}${endpoint}`, options); 
        if (!response.ok) { return { _error: `HTTP Error: ${response.status}` }; }
        const text = await response.text();
        try { return JSON.parse(text); } 
        catch (e) { return { _error: "Bukan Format JSON API" }; }
    } catch (e) {
        return { _error: "Koneksi Diblokir Browser (CORS)" };
    }
}

function saveToStorage() { localStorage.setItem(`orders_${activeAccountName}`, JSON.stringify(activeOrders)); updateAccountOrdersStatus(); renderOrders(); }
function showToast(pesan, type = "success") { const toast = document.getElementById("toast"); if (!toast) return; toast.innerHTML = pesan; if (type === "error") { toast.style.backgroundColor = "var(--danger-color)"; toast.style.color = "#ffffff"; } else { toast.style.backgroundColor = "var(--success-color)"; toast.style.color = "#ffffff"; } toast.classList.add("show"); setTimeout(() => { toast.classList.remove("show"); }, 3000); }
function copyToClipboard(text) { if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(() => { showToast("Berhasil disalin!"); }).catch(err => { copyFallback(text); }); } else { copyFallback(text); } }
function copyFallback(text) { const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = "absolute"; ta.style.left = "-9999px"; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, 99999); try { document.execCommand('copy'); showToast("Berhasil disalin!"); } catch (err) { showToast("Gagal menyalin.", "error"); } document.body.removeChild(ta); }

// ==========================================
// PENCARIAN SALDO HYBRID
// ==========================================
async function fetchBalance() { 
    const bDisplay = document.getElementById('balanceDisplay'); 
    try {
        let res = await apiCall('/balance');
        if (res && res._error) res = await apiCall('/profile'); // Auto-fallback rute
        
        if (res && res._error) {
            if (bDisplay) { bDisplay.innerText = res._error; bDisplay.style.color = "var(--danger-color)"; } return;
        }

        let parsedBal = null;
        // Prioritaskan format lama masreno6pro
        if (res.success && res.data && res.data.balance !== undefined) {
            parsedBal = extractNumber(res.data.balance);
        } else {
            // Jika beda format, gunakan Scanner
            parsedBal = getAnyNumber(res, ['bal', 'sal', 'amount', 'cred', 'wall', 'point', 'uang', 'dana']);
        }
        
        if (parsedBal !== null) { 
            const formatter = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }); 
            if (bDisplay) { bDisplay.innerText = formatter.format(parsedBal); bDisplay.style.color = "var(--primary-color)"; }
        } else {
            if (bDisplay) { bDisplay.innerText = "Data Kosong"; bDisplay.style.color = "var(--warning-color)"; }
        }
    } catch (error) {
        if (bDisplay) { bDisplay.innerText = "Gagal"; bDisplay.style.color = "var(--danger-color)"; }
    }
}

// ==========================================
// PENCARIAN PRODUK HYBRID
// ==========================================
async function loadShopeeIndonesia() {
    try {
        if (productList) productList.innerHTML = '<div class="status-text">Mencari Server...</div>';
        
        const countriesRes = await apiCall('/catalog/countries'); 
        if (countriesRes && countriesRes._error) {
            if (productList) productList.innerHTML = `<div class="status-text" style="color:var(--danger-color);">${countriesRes._error}</div>`; return;
        }

        let indoId = null; let shopeeId = null;
        if (countriesRes) {
            let extractedCountries = (countriesRes.success && countriesRes.data) ? countriesRes.data : (Array.isArray(countriesRes) ? countriesRes : []);
            const indo = extractedCountries.find(c => c && c.name && c.name.toLowerCase() === 'indonesia');
            if (indo) indoId = indo.id;
        }
        
        if (indoId) {
            const servicesRes = await apiCall(`/catalog/services?country_id=${indoId}`); 
            let extractedServices = (servicesRes.success && servicesRes.data) ? servicesRes.data : (Array.isArray(servicesRes) ? servicesRes : []);
            const shopee = extractedServices.find(s => s && s.name && s.name.toLowerCase().includes('shopee'));
            if (shopee) shopeeId = shopee.id;
        }
        
        const productsEndpoint = (indoId && shopeeId) ? `/catalog/products?country_id=${indoId}&platform_id=${shopeeId}` : `/catalog/products`;
        const productsRes = await apiCall(productsEndpoint);
        
        if (productsRes && productsRes._error) {
            if (productList) productList.innerHTML = `<div class="status-text" style="color:var(--danger-color);">${productsRes._error}</div>`; return;
        }

        let extractedProducts = [];
        if (productsRes) {
            if (productsRes.success && productsRes.data) extractedProducts = productsRes.data;
            else if (Array.isArray(productsRes)) extractedProducts = productsRes;
            else if (productsRes.products && Array.isArray(productsRes.products)) extractedProducts = productsRes.products;
        }

        if (extractedProducts && extractedProducts.length > 0) {
            availableProducts = extractedProducts.sort((a, b) => {
                let pA = getAnyNumber(a, ['pric', 'cost', 'rate', 'fee', 'harg', 'rp', 'amount']) || 0;
                let pB = getAnyNumber(b, ['pric', 'cost', 'rate', 'fee', 'harg', 'rp', 'amount']) || 0;
                return pA - pB;
            });
            
            if (productList) productList.innerHTML = ""; if (availableProducts.length > 0) { selectedProductId = availableProducts[0].id; if (btnOrder) btnOrder.disabled = false; }
            
            availableProducts.forEach(product => {
                const card = document.createElement("div"); card.className = "product-card"; if (selectedProductId === product.id) { card.classList.add('selected'); }
                
                let parsedPrice = getAnyNumber(product, ['pric', 'cost', 'rate', 'fee', 'harg', 'rp', 'amount']);
                let parsedStok = getAnyNumber(product, ['avail', 'qty', 'stock', 'count', 'stok', 'sisa']);
                let rawStok = parsedStok !== null ? parsedStok : 'Tersedia';
                
                let displayPrice;
                if (parsedPrice !== null) {
                    const formatter = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }); 
                    displayPrice = formatter.format(parsedPrice);
                } else { displayPrice = `<span style="font-size:10px; color:var(--danger-color);">Format Baru</span>`; }
                
                card.innerHTML = `<div class="product-info"><h4>Server ID: ${product.id}</h4><p>Stok: ${rawStok}</p></div><div class="product-price" style="background:transparent; box-shadow:none; padding:0; display:flex; align-items:center; justify-content:flex-end; text-align:right;">${displayPrice}</div>`;
                card.onclick = () => { document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected')); card.classList.add('selected'); selectedProductId = product.id; if (btnOrder) btnOrder.disabled = false; };
                if (productList) productList.appendChild(card);
            });
        } else { 
            if (productList) productList.innerHTML = '<div class="status-text">Katalog Tidak Tersedia / Kosong.</div>'; 
        }
    } catch (error) { 
        if (productList) productList.innerHTML = `<div class="status-text" style="color:var(--danger-color);">Error koneksi API</div>`; 
    }
}

if (btnOrder) {
    btnOrder.onclick = async () => {
        if (!isUsedNumbersLoaded) { showToast("Sabar, sedang mensinkronkan database nomor...", "warning"); return; }
        if (!selectedProductId) return; btnOrder.disabled = true; const originalText = btnOrder.innerText; btnOrder.innerText = "Memproses...";
        try {
            const res = await apiCall('/orders/create', 'POST', { product_id: parseInt(selectedProductId), quantity: 1 });
            if (res && res._error) { showToast(`Gagal: ${res._error}`, "error"); btnOrder.innerText = originalText; btnOrder.disabled = false; return; }

            let orderData = null;
            if (res && res.success && res.data && res.data.orders) orderData = res.data.orders[0];
            else if (res && res.order) orderData = res.order;
            else if (res && res.id) orderData = res;
            
            if (orderData && orderData.id) {
                const productInfo = availableProducts.find(p => String(p.id) === String(selectedProductId));
                let productFinalPrice = productInfo ? getAnyNumber(productInfo, ['pric', 'cost', 'rate', 'fee', 'harg', 'rp', 'amount']) : 0;
                let orderPrice = getAnyNumber(orderData, ['pric', 'cost', 'rate', 'fee', 'harg', 'rp', 'amount']);
                const finalPrice = orderPrice !== null ? orderPrice : (productFinalPrice !== null ? productFinalPrice : 0);
                
                const expiresAtMs = orderData.expires_at ? new Date(orderData.expires_at).getTime() : Date.now() + (20 * 60 * 1000); const createdAtMs = orderData.created_at ? new Date(orderData.created_at).getTime() : Date.now();
                activeOrders.unshift({ id: orderData.id, productId: parseInt(selectedProductId), phone: orderData.phone_number || orderData.phone, price: finalPrice, otp: null, status: "ACTIVE", expiresAt: expiresAtMs, cancelUnlockTime: createdAtMs + (120 * 1000), isAutoCanceling: false });
                saveToStorage(); startPollingAndTimer(); fetchBalance(); window.scrollTo({ top: 0, behavior: 'smooth' }); copyToClipboard(orderData.phone_number || orderData.phone);
            } else { showToast(`Gagal: Format Order Tidak Dikenali`, "error"); }
        } catch (error) { showToast("Kesalahan jaringan.", "error"); }
        btnOrder.innerText = originalText; btnOrder.disabled = false;
    };
}

function renderOrders() {
    if (activeCount) activeCount.innerText = activeOrders.length;
    if (activeOrders.length === 0) { if (activeOrdersContainer) activeOrdersContainer.innerHTML = '<div class="status-text">Belum ada pesanan aktif.</div>'; return; }
    if (activeOrdersContainer) activeOrdersContainer.innerHTML = "";
    const now = Date.now();
    activeOrders.forEach(order => {
        const card = document.createElement("div"); card.className = "order-card"; card.id = `order-card-${order.id}`; 
        let isSuccess = (order.status === "OTP_RECEIVED" && order.otp);
        const wait = order.cancelUnlockTime - now;
        let otpHtml = isSuccess ? `<div class="otp-title">KODE OTP</div><div class="otp-code">${formatOTP(order.otp)}</div>` : `<div class="waiting-animation"><div class="dot-pulse"></div><div class="dot-pulse"></div></div><div class="waiting-text">MENUNGGU...</div>`;
        const passProductId = order.productId ? `'${order.productId}'` : 'null';
        const providerName = getProviderName(order.phone);
        
        let cancelBtnAttr = "disabled"; let replaceBtnAttr = "disabled"; let resendBtnAttr = "disabled"; let finishBtnAttr = "disabled";
        
        if (isSuccess) { finishBtnAttr = ""; resendBtnAttr = ""; cancelBtnAttr = "disabled"; replaceBtnAttr = "disabled"; } 
        else if (wait <= 0 && !order.isAutoCanceling) { cancelBtnAttr = ""; replaceBtnAttr = ""; resendBtnAttr = "disabled"; } 
        else if (order.isAutoCanceling) { cancelBtnAttr = "disabled"; replaceBtnAttr = "disabled"; resendBtnAttr = "disabled"; }

        let parsedDisplayPrice = extractNumber(order.price);
        const displayPrice = (parsedDisplayPrice !== null && parsedDisplayPrice !== 0) ? `Rp ${parsedDisplayPrice}` : 'Rp -';

        card.innerHTML = `<div class="order-header"><div class="order-info-left"><span class="order-id-label">#${order.id} (${providerName})</span> <span class="order-price">${displayPrice}</span></div><span class="timer" id="timer-${order.id}">--:--</span></div><div class="phone-row"><span class="phone-number">${formatPhoneNumber(order.phone)}</span><button class="btn-copy" onclick="copyToClipboard('${order.phone}')"><i class="fas fa-copy"></i></button></div><div class="otp-display ${isSuccess ? 'success-glow' : ''}">${otpHtml}</div><div class="action-buttons-grid"><button class="btn-replace" id="btn-replace-${order.id}" onclick="replaceSpecificOrder(${order.id}, ${passProductId})" ${replaceBtnAttr}><i class="fas fa-sync-alt"></i> Ganti</button><button class="btn-resend" id="btn-resend-${order.id}" onclick="resendSpecificOrder(${order.id})" ${resendBtnAttr}><i class="fas fa-envelope"></i> Ulang</button><button class="btn-danger" id="btn-cancel-${order.id}" onclick="cancelSpecificOrder(${order.id})" ${cancelBtnAttr}><i class="fas fa-times"></i> Batal</button><button class="btn-success" id="btn-finish-${order.id}" onclick="finishSpecificOrder(${order.id})" ${finishBtnAttr}><i class="fas fa-check"></i> Selesai</button></div>`;
        if (activeOrdersContainer) activeOrdersContainer.appendChild(card);
    });
}

function startPollingAndTimer() {
    if (timerInterval) clearInterval(timerInterval); if (pollingInterval) clearInterval(pollingInterval);
    timerInterval = setInterval(() => {
        const now = Date.now();
        activeOrders.forEach((order, index) => {
            const timeLeft = order.expiresAt - now; const timerElement = document.getElementById(`timer-${order.id}`);
            if (timeLeft <= 0) { activeOrders.splice(index, 1); saveToStorage(); fetchBalance(); return; }
            if (timerElement) { const m = Math.floor((timeLeft / 1000 / 60) % 60); const s = Math.floor((timeLeft / 1000) % 60); timerElement.innerText = `${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`; }
            if (timeLeft <= 600000 && order.status !== "OTP_RECEIVED" && !order.isAutoCanceling) { order.isAutoCanceling = true; cancelSpecificOrder(order.id, true); }
            const wait = order.cancelUnlockTime - now; const btnCancel = document.getElementById(`btn-cancel-${order.id}`); const btnReplace = document.getElementById(`btn-replace-${order.id}`); const btnResend = document.getElementById(`btn-resend-${order.id}`); 
            if (order.status !== "OTP_RECEIVED" && !order.isAutoCanceling) { if (wait <= 0) { if (btnCancel && btnCancel.disabled) btnCancel.disabled = false; if (btnReplace && btnReplace.disabled && !btnReplace.innerHTML.includes('loader')) btnReplace.disabled = false; if (btnResend && !btnResend.disabled) btnResend.disabled = true; } else { if (btnCancel && !btnCancel.disabled) btnCancel.disabled = true; if (btnReplace && !btnReplace.disabled) btnReplace.disabled = true; if (btnResend && !btnResend.disabled) btnResend.disabled = true; } }
        });
    }, 1000);
    pollingInterval = setInterval(async () => {
        if (activeOrders.length === 0) return;
        for (let i = 0; i < activeOrders.length; i++) {
            let order = activeOrders[i]; if (order.status === "OTP_RECEIVED") continue;
            try {
                const res = await apiCall(`/orders/${order.id}`);
                if (res && res._error) continue;
                
                let statusInfo = null; let otpCode = null;
                if (res.success && res.data) { statusInfo = res.data.status; otpCode = res.data.otp_code; } 
                else if (res) { statusInfo = res.status; otpCode = res.otp || res.code; }
                
                if (statusInfo) {
                    if (statusInfo === "OTP_RECEIVED" || statusInfo === "SUCCESS" || otpCode) { notifSound.play().catch(e => console.log("Sound error:", e)); activeOrders[i].status = "OTP_RECEIVED"; activeOrders[i].otp = otpCode; saveToStorage(); fetchBalance(); const phoneStr = normalizePhone(activeOrders[i].phone); if (!usedNumbersDB.has(phoneStr)) { db.ref('used_numbers/smscode').push({ phone: phoneStr, timestamp: Date.now() }); usedNumbersDB.add(phoneStr); } } else if (statusInfo !== "ACTIVE" && statusInfo !== "PENDING" && statusInfo !== "WAITING") { activeOrders = activeOrders.filter(o => o.id !== order.id); saveToStorage(); fetchBalance(); }
                }
            } catch (e) {}
        }
    }, 3000);
}

window.cancelSpecificOrder = async function(id, auto = false) {
    const btnCancel = document.getElementById(`btn-cancel-${id}`); if (btnCancel) { btnCancel.disabled = true; btnCancel.innerHTML = '<div class="loader"></div>'; }
    const oldOrder = activeOrders.find(o => String(o.id) === String(id)); if (oldOrder) saveToHistory(oldOrder, "BATAL");
    recordStat('failed');
    try { const res = await apiCall('/orders/cancel', 'POST', { id: id }); if (res && ((res.success) || (!res.error || res.error.code === 'NOT_FOUND'))) { activeOrders = activeOrders.filter(o => o.id !== id); saveToStorage(); fetchBalance(); if(auto) showToast("Otomatis dibatalkan (Waktu Sisa 10 Menit)", "error"); } else { showToast("Gagal dibatalkan.", "error"); if (btnCancel) { btnCancel.disabled = false; btnCancel.innerHTML = '<i class="fas fa-times"></i> Batal'; } } } catch (e) { if (btnCancel) { btnCancel.disabled = false; btnCancel.innerHTML = '<i class="fas fa-times"></i> Batal'; } }
};

window.finishSpecificOrder = async function(id) {
    const btnFinish = document.getElementById(`btn-finish-${id}`); if (btnFinish) { btnFinish.disabled = true; btnFinish.innerHTML = '<div class="loader"></div>'; }
    const oldOrder = activeOrders.find(o => String(o.id) === String(id)); if (oldOrder) saveToHistory(oldOrder, "SUKSES");
    if (appSettings.autoCopy) { copyToClipboard(appSettings.password); }
    recordStat('success');
    try { await apiCall('/orders/finish', 'POST', { id: id }); } catch (e) {} activeOrders = activeOrders.filter(o => o.id !== id); saveToStorage();
};

async function initMainApp() { const bDisplay = document.getElementById('balanceDisplay'); if (bDisplay) bDisplay.innerText = "..."; await loadShopeeIndonesia(); renderOrders(); if (activeOrders.length > 0) startPollingAndTimer(); }

window.onload = () => { relocateBalanceUI(); setAccountViewingStatus(false); history.pushState(null, null, window.location.href); initUsedNumbersSync(); renderMainButtons(); if (activeAccountName && BASE_URL) { loginAccount(activeAccountName); } else { openApiModal(); } };
