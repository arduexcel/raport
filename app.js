const firebaseConfig = {
  apiKey: "AIzaSyCuUstd-6d0E-EbmQipv2mWk-bA55ajpQ0",
  authDomain: "car-system-4594d.firebaseapp.com",
  projectId: "car-system-4594d",
  storageBucket: "car-system-4594d.firebasestorage.app",
  messagingSenderId: "719030469585",
  appId: "1:719030469585:web:7a23645b9e684b727dd6f0",
};

const config2 = {
  apiKey: "AIzaSyAMI84_IuKUZVqc8ImMW7eahru20cTkjFM",
  authDomain: "sysam-k.firebaseapp.com",
  projectId: "sysam-k",
  storageBucket: "sysam-k.firebasestorage.app",
  messagingSenderId: "905972435434",
  appId: "1:905972435434:web:2501e11240523f8368ca93",
};

const app1 = firebase.initializeApp(firebaseConfig, "app1");
const app2 = firebase.initializeApp(config2, "app2");

const db1 = app1.firestore();
const db2 = app2.firestore();

let currentUser = null;
let currentInvoices = [];
let manualInvoicePrices = {};
let unsubscribeUsersList = null;
let taxiExitEntries = []; // FIX: track onSnapshot unsubscribe to prevent listener leaks

window.onload = function () {
  const savedUser = localStorage.getItem("terminalAdminUser");
  if (savedUser && savedUser !== "null") {
    try {
      currentUser = JSON.parse(savedUser);
      startApp();
    } catch (e) {
      localStorage.removeItem("terminalAdminUser");
      showLogin();
    }
  } else {
    showLogin();
  }
};

function showLogin() {
  document.getElementById("login-overlay").style.display = "flex";
  document.getElementById("mainApp").style.display = "none";
  document.getElementById("userInput").value = "";
  document.getElementById("passInput").value = "";
}

async function login() {
  const btn = document.querySelector("#login-overlay .btn");
  const user = document.getElementById("userInput").value.trim();
  const pass = document.getElementById("passInput").value;

  if (!user || !pass) return alert("تکایە ناو و پاسۆرد بنووسە!");

  // FIX: disable button during async request to prevent spam clicks
  btn.disabled = true;
  btn.innerText = "چاوەڕێ...";

  try {
    if (user === "admin" && pass === "0055") {
      currentUser = { name: "Admin Main", role: "admin" };
      localStorage.setItem("terminalAdminUser", JSON.stringify(currentUser));
      startApp();
      return;
    }

    const snap = await db1
      .collection("Employees")
      .where("name", "==", user)
      .where("password", "==", pass)
      .get();

    if (!snap.empty) {
      currentUser = snap.docs[0].data();
      if (currentUser.role === "staff") {
        alert("تۆ دەسەڵاتی بینینی ئەم بەشەت نییە!");
      } else {
        localStorage.setItem("terminalAdminUser", JSON.stringify(currentUser));
        startApp();
      }
    } else {
      alert("ناو یان پاسۆرد هەڵەیە!");
    }
  } catch (e) {
    alert("هەڵە لە پەیوەندی داتابەیس!");
  } finally {
    btn.disabled = false;
    btn.innerText = "چوونەژوورەوە";
  }
}

function logout() {
  if (confirm("دڵنیای لە دەرچوون؟")) {
    // FIX: unsubscribe Firestore listener before logging out
    if (unsubscribeUsersList) {
      unsubscribeUsersList();
      unsubscribeUsersList = null;
    }
    localStorage.removeItem("terminalAdminUser");
    currentUser = null;
    document.getElementById("login-overlay").style.display = "flex";
    document.getElementById("mainApp").style.display = "none";
    document.getElementById("userInput").value = "";
    document.getElementById("passInput").value = "";
    window.location.reload();
  }
}

async function startApp() {
  document.getElementById("login-overlay").style.display = "none";
  document.getElementById("mainApp").style.display = "block";

  const displayRole =
    currentUser.role === "admin"
      ? "بەڕێوەبەر"
      : currentUser.role === "audit"
        ? "وردبین"
        : "ژمێریار";

  document.getElementById("userStatus").innerText =
    `بەخێرهاتی: ${currentUser.name} (${displayRole})`;

  if (currentUser.name.toLowerCase() === "azad") {
    document.getElementById("manualInvoiceBtn").style.display = "inline-flex";
  }

  const now = new Date();
  document.getElementById("reportDate").valueAsDate = now;
  updatePrintDate();

  if (currentUser.role === "admin" || currentUser.role === "audit") {
    document.getElementById("adminOnlyBtn").style.display = "inline-flex";
    document.getElementById("addCarBtn").style.display = "inline-flex";
    loadUsersList();
  } else {
    document.getElementById("adminOnlyBtn").style.display = "none";
    document.getElementById("addCarBtn").style.display = "none";
  }

  if (currentUser.role === "audit") {
    document.getElementById("taxiExitBtn").style.display = "inline-flex";
    document.getElementById("dailyTaxiExitBtn").style.display = "inline-flex";
  }

  loadEmployees();
  await loadManualInvoicePrices();
  fetchInvoices();
}

async function loadEmployees() {
  const empSelect = document.getElementById("empFilter");
  const snap = await db1
    .collection("Employees")
    .where("role", "==", "staff")
    .get();

  // FIX: build full HTML string first, then set innerHTML once (not += in a loop)
  let html = '<option value="">هەموو کارمەندەکان</option>';
  snap.forEach((doc) => {
    const name = doc.data().name;
    html += `<option value="${name}">${name}</option>`;
  });
  empSelect.innerHTML = html;
}

function updatePrintDate() {
  const val = document.getElementById("reportDate").value;
  const d = val ? new Date(val + "T00:00:00") : new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  document.getElementById("printDateTime").innerText = `${yyyy}/${mm}/${dd}`;
}

async function fetchInvoices() {
  const date = document.getElementById("reportDate").value;
  const lineVal = document.getElementById("lineFilter").value;
  const empVal = document.getElementById("empFilter").value;

  if (!date) return;

  const snap = await db1
    .collection("Invoices")
    .doc(date)
    .collection("AllInvoices")
    .get();

  let allItems = [];
  snap.forEach((doc) => {
    const data = doc.data();
    data.id = doc.id;
    allItems.push(data);
  });

  allItems.sort((a, b) => (parseInt(a.invoiceNo) || 0) - (parseInt(b.invoiceNo) || 0));

  currentInvoices = [];
  let totalMoney = 0;
  let count = 0;
  // FIX: build all row HTML in a string, then set innerHTML once instead of += per row
  let rowsHtml = "";

  allItems.forEach((inv) => {
    const invId = inv.id;
    if (
      (lineVal === "" || inv.line === lineVal) &&
      (empVal === "" || inv.employee === empVal)
    ) {
      currentInvoices.push(inv);

      const isDeleted = inv.status === "deleted" || inv.status === "canceled";
      if (!isDeleted) {
        count++;
        totalMoney += parseInt(inv.price) || 0;
      }

      const rowClass = isDeleted ? "deleted-row" : "";
      let actionBtn = "";

      if (isDeleted) {
        if (currentUser.role === "admin" || currentUser.role === "audit") {
          actionBtn = `<button class="btn btn-success no-print" style="padding:5px 10px;font-size:12px;" onclick="restoreInvoice('${invId}','${date}')">گەڕاندنەوە</button>`;
        } else {
          actionBtn = `<span style="font-size:12px;color:gray;">سڕاوەتەوە</span>`;
        }
      } else {
        if (currentUser.role === "admin" || currentUser.role === "audit") {
          const encNote = encodeURIComponent(inv.note || "");
          actionBtn = `
            <button class="btn btn-primary no-print" style="padding:5px 10px;font-size:12px;margin-left:4px;" onclick="openUpdateInvoice('${invId}','${date}','${inv.carNumber || ""}','${inv.type || ""}','${inv.line || ""}',${parseInt(inv.price)||0},'${encNote}')">نوێکردنەوە</button>
            <button class="btn btn-danger no-print" style="padding:5px 10px;font-size:12px;" onclick="softDeleteInvoice('${invId}','${inv.carNumber}','${date}')">سڕینەوە</button>`;
        }
      }

      // FIX: use (parseInt(inv.price) || 0) to avoid NaN.toLocaleString() crash
      const priceDisplay = (parseInt(inv.price) || 0).toLocaleString();
      const timeDisplay = inv.date
        ? inv.date.includes(" ")
          ? inv.date.split(" ")[1]
          : inv.date
        : "---";

      rowsHtml += `<tr class="${rowClass}">
        <td>${inv.invoiceNo || "---"}</td>
        <td>${timeDisplay}</td>
        <td>${inv.employee || "---"}</td>
        <td><b>${inv.carNumber || "---"}</b></td>
        <td>${inv.type || "نادیار"}</td>
        <td>${inv.line || "---"}</td>
        <td>${priceDisplay} IQD</td>
        <td>${inv.note || ""}</td>
        <td class="reason-cell">${inv.deleteReason || ""}</td>
        <td class="no-print">${actionBtn}</td>
      </tr>`;
    }
  });

  document.getElementById("invoiceBody").innerHTML = rowsHtml;

  document.getElementById("totalCount").innerText = count;
  document.getElementById("totalMoney").innerText = totalMoney.toLocaleString() + " IQD";
  document.getElementById("topTotalCount").innerText = count;
  document.getElementById("topTotalMoney").innerText = totalMoney.toLocaleString() + " IQD";

  const isAzad = currentUser.name.toLowerCase() === "azad";
  const manualExtra = isAzad ? (manualInvoicePrices[date] || 0) : 0;
  const dayTotal = (totalMoney + manualExtra).toLocaleString() + " IQD";
  const manualStr = manualExtra.toLocaleString() + " IQD";

  const showManual = isAzad && manualExtra > 0;
  document.getElementById("manualExtraCard").style.display = showManual ? "" : "none";
  document.getElementById("dayTotalCard").style.display = showManual ? "" : "none";
  document.getElementById("topManualExtra").innerText = manualStr;
  document.getElementById("topDayTotal").innerText = dayTotal;

  document.getElementById("bottomManualExtraCard").style.display = showManual ? "" : "none";
  document.getElementById("bottomDayTotalCard").style.display = showManual ? "" : "none";
  document.getElementById("bottomManualExtra").innerText = manualStr;
  document.getElementById("bottomDayTotal").innerText = dayTotal;
}

function downloadExcel() {
  if (currentInvoices.length === 0) {
    alert("هیچ داتایەک نییە بۆ دابەزاندن!");
    return;
  }
  let csvContent = "\uFEFF";
  csvContent += "ژ.وەسڵ,کات,کارمەند,ژمارەی ئۆتۆمبێل,جۆری ئۆتۆمبێل,هێڵ,نرخ,تێبینی,دۆخ\n";
  currentInvoices.forEach((inv) => {
    const row = [
      inv.invoiceNo || "",
      inv.date || "",
      inv.employee || "",
      inv.carNumber || "",
      inv.type || "",
      inv.line || "",
      inv.price || 0,
      (inv.note || "").replace(/,/g, " "),
      inv.status || "active",
    ].join(",");
    csvContent += row + "\n";
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = document.getElementById("reportDate").value;
  link.setAttribute("href", url);
  link.setAttribute("download", `Report_${date}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // FIX: revoke object URL to free memory
  URL.revokeObjectURL(url);
}

async function softDeleteInvoice(id, carNum, date) {
  const reason = prompt(`هۆکاری سڕینەوەی وەسڵی (${carNum}) بنووسە:`);
  if (!reason) return;

  try {
    await db1
      .collection("Invoices")
      .doc(date)
      .collection("AllInvoices")
      .doc(id)
      .update({
        status: "deleted",
        deleteReason: reason,
        deletedBy: currentUser.name,
        deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    await db2
      .collection("Invoices")
      .doc(date)
      .collection("AllInvoices")
      .doc(id)
      .delete();
    fetchInvoices();
  } catch (e) {
    alert("هەڵە لە سڕینەوە");
  }
}

async function restoreInvoice(id, date) {
  if (!confirm("دڵنیای لە گەڕاندنەوەی ئەم وەسڵە؟")) return;

  try {
    const docRef = db1
      .collection("Invoices")
      .doc(date)
      .collection("AllInvoices")
      .doc(id);
    const docSnap = await docRef.get();
    const invData = docSnap.data();

    await docRef.update({
      status: "active",
      deleteReason: firebase.firestore.FieldValue.delete(),
      deletedBy: firebase.firestore.FieldValue.delete(),
      deletedAt: firebase.firestore.FieldValue.delete(),
    });

    const cleanData = { ...invData };
    cleanData.status = "active";
    delete cleanData.deleteReason;
    delete cleanData.deletedBy;
    delete cleanData.deletedAt;

    await db2
      .collection("Invoices")
      .doc(date)
      .collection("AllInvoices")
      .doc(id)
      .set(cleanData);
    alert("گەڕایەوە");
    fetchInvoices();
  } catch (e) {
    alert("هەڵە لە گەڕاندنەوە");
  }
}

function toggleModal(s) {
  document.getElementById("userModal").style.display = s ? "flex" : "none";
  if (!s) clearUserForm();
}

function clearUserForm() {
  document.getElementById("editUserId").value = "";
  document.getElementById("newUserName").value = "";
  document.getElementById("newUserPass").value = "";
  document.getElementById("newUserRole").value = "staff";
  document.getElementById("saveUserBtn").innerText = "تۆمارکردن";
  document.getElementById("saveUserBtn").className = "btn btn-success";
}

async function saveUser() {
  const id = document.getElementById("editUserId").value;
  const n = document.getElementById("newUserName").value.trim();
  const p = document.getElementById("newUserPass").value.trim();
  const r = document.getElementById("newUserRole").value;

  if (!n || !p) return alert("تکایە خانەکان پڕ بکەرەوە");

  const userData = { name: n, password: p, role: r };

  try {
    if (id) {
      await db1.collection("Employees").doc(id).update(userData);
      alert("بە سەرکەوتوویی نوێکرایەوە");
    } else {
      userData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db1.collection("Employees").add(userData);
      alert("بە سەرکەوتوویی تۆمارکرا");
    }
    clearUserForm();
    loadEmployees();
  } catch (e) {
    alert("هەڵەیەک ڕوویدا!");
  }
}

function editUser(id, name, pass, role) {
  document.getElementById("editUserId").value = id;
  document.getElementById("newUserName").value = name;
  document.getElementById("newUserPass").value = pass;
  document.getElementById("newUserRole").value = role;
  document.getElementById("saveUserBtn").innerText = "نوێکردنەوە";
  document.getElementById("saveUserBtn").className = "btn btn-primary";
}

function loadUsersList() {
  // FIX: unsubscribe previous listener before creating a new one
  if (unsubscribeUsersList) {
    unsubscribeUsersList();
  }
  unsubscribeUsersList = db1
    .collection("Employees")
    .orderBy("role")
    .onSnapshot((snap) => {
      const tbody = document.getElementById("userTableBody");
      // FIX: build full HTML string, then set innerHTML once
      let html = "";
      snap.forEach((doc) => {
        const u = doc.data();
        const uid = doc.id;
        // FIX: was `u.role === "   "` (3 spaces) — corrected to "accounts"
        const rClass =
          u.role === "admin"
            ? "badge-admin"
            : u.role === "audit"
              ? "badge-audit"
              : u.role === "accounts"
                ? "badge-acc"
                : "badge-staff";
        html += `<tr>
          <td>${u.name}</td>
          <td>${u.password}</td>
          <td><span class="badge ${rClass}">${u.role}</span></td>
          <td>
            <button onclick="editUser('${uid}','${u.name}','${u.password}','${u.role}')" style="color:blue;border:none;background:none;cursor:pointer;margin-left:10px;">دەستکاری</button>
            <button onclick="deleteUser('${uid}')" style="color:red;border:none;background:none;cursor:pointer;">سڕینەوە</button>
          </td>
        </tr>`;
      });
      tbody.innerHTML = html;
    });
}

async function deleteUser(id) {
  if (confirm("دڵنیای لە سڕینەوە؟")) {
    await db1.collection("Employees").doc(id).delete();
    loadEmployees();
  }
}

async function calcRange() {
  const from = document.getElementById("rangeFrom").value;
  const to = document.getElementById("rangeTo").value;
  if (!from || !to) return alert("تکایە هەر دوو بەروار هەڵبژێرە!");
  if (from > to) return alert("بەرواری (لە) دەبێت کەمتر بێت لە بەرواری (بۆ)!");

  document.getElementById("rangeResult").style.display = "block";
  document.getElementById("rangeCount").innerText = "...";
  document.getElementById("rangeTotal").innerText = "...";

  const dates = [];
  let cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) {
    dates.push(cur.toISOString().split("T")[0]);
    cur.setDate(cur.getDate() + 1);
  }

  const promises = dates.map((d) =>
    db1
      .collection("Invoices")
      .doc(d)
      .collection("AllInvoices")
      .get()
      .then((snap) => ({ snap }))
      .catch(() => ({ snap: null })),
  );

  const results = await Promise.all(promises);
  let grandTotal = 0;
  let grandCount = 0;
  results.forEach(({ snap }) => {
    if (!snap) return;
    snap.forEach((doc) => {
      const data = doc.data();
      if (data.status !== "deleted" && data.status !== "canceled") {
        grandTotal += parseInt(data.price) || 0;
        grandCount++;
      }
    });
  });

  document.getElementById("rangeCount").innerText = grandCount;
  document.getElementById("rangeTotal").innerText = grandTotal.toLocaleString() + " IQD";
}

function showLineReport() {
  const date = document.getElementById("reportDate").value;
  if (!date) return alert("تکایە بەروار هەڵبژێرە!");

  const lineMap = {};
  currentInvoices.forEach((inv) => {
    if (inv.status === "deleted" || inv.status === "canceled") return;
    const line = inv.line || "پارکینگ";
    const type = inv.type || "نادیار";
    if (!lineMap[line]) lineMap[line] = { types: {}, total: 0, count: 0 };
    if (!lineMap[line].types[type]) lineMap[line].types[type] = { count: 0, total: 0 };
    lineMap[line].types[type].count++;
    lineMap[line].types[type].total += parseInt(inv.price) || 0;
    lineMap[line].count++;
    lineMap[line].total += parseInt(inv.price) || 0;
  });

  const entries = Object.entries(lineMap).sort((a, b) => b[1].count - a[1].count);

  if (entries.length === 0) {
    document.getElementById("lineReportContent").innerHTML =
      '<p style="text-align:center;color:gray;">هیچ داتایەک نییە</p>';
    document.getElementById("lineReportModal").style.display = "flex";
    return;
  }

  let rows = "";
  let grandTotal = 0;
  let grandCount = 0;
  let parkingCount = 0;

  entries.forEach(([line, data]) => {
    grandTotal += data.total;
    grandCount += data.count;
    if (line === "پارکینگ") parkingCount = data.count;

    const typeEntries = Object.entries(data.types).sort((a, b) => b[1].count - a[1].count);
    const typeHtml = typeEntries
      .map(
        ([type, td]) =>
          `<span style="display:inline-block;background:#f0f3f5;border-radius:6px;padding:3px 10px;margin:2px;font-size:13px;">${type}: <b>${td.count}</b></span>`,
      )
      .join("");

    rows += `<tr${line === "پارکینگ" ? ' style="background:#f5eef8;"' : ""}>
      <td style="font-weight:bold;font-size:15px;">${line}</td>
      <td>${data.count}</td>
      <td style="text-align:right;">${typeHtml}</td>
    </tr>`;
  });

  const parkingCard = parkingCount > 0 ? `
    <div style="background:#8e44ad;color:white;padding:14px;border-radius:10px;text-align:center;">
      <div style="font-size:13px;opacity:.85;">کۆی پارکینگ</div>
      <div style="font-size:24px;font-weight:bold;">${parkingCount}</div>
    </div>` : "";

  document.getElementById("lineReportContent").innerHTML = `
    <p style="text-align:center;color:#555;margin-bottom:15px;">بەروار: <b>${date}</b></p>
    <table>
      <thead>
        <tr><th>هێڵ</th><th>کۆی وەسڵ</th><th>جۆری ئۆتۆمبێل</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:20px;display:grid;grid-template-columns:${parkingCount > 0 ? "1fr 1fr" : "1fr"};gap:12px;">
      <div style="background:var(--primary);color:white;padding:14px;border-radius:10px;text-align:center;">
        <div style="font-size:13px;opacity:.85;">کۆی وەسڵەکان</div>
        <div style="font-size:24px;font-weight:bold;">${grandCount}</div>
      </div>
      ${parkingCard}
    </div>`;
  document.getElementById("lineReportModal").style.display = "flex";
}

function printLineReport() {
  const content = document.getElementById("lineReportContent").innerHTML;
  if (!content) return alert("هیچ داتایەک نییە!");
  document.getElementById("line-print-content").innerHTML = content;
  const el = document.getElementById("line-print-area");
  document.body.classList.add("report-printing");
  el.classList.add("is-printing");
  window.print();
  el.classList.remove("is-printing");
  document.body.classList.remove("report-printing");
}

function printMonthlyReport() {
  const content = document.getElementById("monthlyReportContent").innerHTML;
  if (!content || content.includes("چاوەڕێ"))
    return alert("تکایە سەرەتا مانگێک هەڵبژێرە!");
  const month = document.getElementById("monthPicker").value;
  document.getElementById("monthly-print-content").innerHTML =
    `<p style="text-align:center;color:#555;margin-bottom:5px;">مانگ: <b>${month}</b></p>` + content;
  const el = document.getElementById("monthly-print-area");
  document.body.classList.add("report-printing");
  el.classList.add("is-printing");
  window.print();
  el.classList.remove("is-printing");
  document.body.classList.remove("report-printing");
}

function printManualMonthlyReport() {
  const content = document.getElementById("manualMonthlyContent").innerHTML;
  if (!content || content.includes("چاوەڕێ"))
    return alert("تکایە سەرەتا مانگێک هەڵبژێرە!");
  const month = document.getElementById("manualMonthPicker").value;
  document.getElementById("manual-monthly-print-content").innerHTML =
    `<p style="text-align:center;color:#555;margin-bottom:5px;">مانگ: <b>${month}</b></p>` + content;
  const el = document.getElementById("manual-monthly-print-area");
  document.body.classList.add("report-printing");
  el.classList.add("is-printing");
  window.print();
  el.classList.remove("is-printing");
  document.body.classList.remove("report-printing");
}

function printDailyReport() {
  const content = document.getElementById("dailyReportContent").innerHTML;
  if (!content) return alert("هیچ داتایەک نییە!");
  document.getElementById("print-area-content").innerHTML = content;
  const el = document.getElementById("daily-print-area");
  document.body.classList.add("report-printing");
  el.classList.add("is-printing");
  window.print();
  el.classList.remove("is-printing");
  document.body.classList.remove("report-printing");
}

function openManualInvoiceModal() {
  const date = document.getElementById("reportDate").value || (() => {
    const today = new Date();
    return today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
  })();
  const existing = manualInvoicePrices[date] || 0;
  const display = document.getElementById("manualInvoiceCurrentDisplay");
  if (existing > 0) {
    document.getElementById("manualInvoiceCurrentValue").innerText =
      existing.toLocaleString() + " IQD";
    display.style.display = "block";
  } else {
    display.style.display = "none";
  }
  document.getElementById("manualInvoiceInput").value = "";
  document.getElementById("manualInvoiceSaved").style.display = "none";
  document.getElementById("manualInvoiceModal").style.display = "flex";
}

async function saveManualInvoice() {
  const date = document.getElementById("reportDate").value || (() => {
    const today = new Date();
    return today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
  })();
  const val = parseInt(document.getElementById("manualInvoiceInput").value) || 0;
  manualInvoicePrices[date] = val;
  await db1.collection("ManualInvoices").doc(date).set({ price: val });
  fetchInvoices();
  document.getElementById("manualInvoiceCurrentValue").innerText =
    val.toLocaleString() + " IQD";
  document.getElementById("manualInvoiceCurrentDisplay").style.display =
    val > 0 ? "block" : "none";
  document.getElementById("manualInvoiceInput").value = "";
  const saved = document.getElementById("manualInvoiceSaved");
  saved.innerText = `✅ تۆمارکرا: ${val.toLocaleString()} IQD`;
  saved.style.display = "block";
  setTimeout(() => {
    document.getElementById("manualInvoiceModal").style.display = "none";
  }, 1200);
}

async function deleteManualInvoice(date) {
  if (!confirm("دڵنیای لە سڕینەوەی وەسڵی دەستی؟")) return;
  manualInvoicePrices[date] = 0;
  await db1.collection("ManualInvoices").doc(date).delete();
  fetchInvoices();
  showDailyReport();
}

function openUpdateInvoice(id, date, carNumber, type, line, price, encodedNote) {
  const note = decodeURIComponent(encodedNote);
  document.getElementById("updateInvId").value = id;
  document.getElementById("updateInvDate").value = date;
  document.getElementById("updateCarNumber").value = carNumber;
  document.getElementById("updateType").value = type;
  document.getElementById("updateLine").value = line;
  document.getElementById("updatePrice").value = price;
  document.getElementById("updateNote").value = note;
  document.getElementById("updateInvoiceModal").style.display = "flex";
}

async function saveUpdateInvoice() {
  const id = document.getElementById("updateInvId").value;
  const date = document.getElementById("updateInvDate").value;
  const carNumber = document.getElementById("updateCarNumber").value.trim();
  const type = document.getElementById("updateType").value.trim();
  const line = document.getElementById("updateLine").value;
  const price = parseInt(document.getElementById("updatePrice").value) || 0;
  const note = document.getElementById("updateNote").value.trim();

  if (!carNumber || !line || !price) {
    alert("تکایە خانەکانی پێویست پڕ بکەرەوە");
    return;
  }

  const updates = { carNumber, type, line, price, note };

  try {
    await db1.collection("Invoices").doc(date).collection("AllInvoices").doc(id).update(updates);
    await db2.collection("Invoices").doc(date).collection("AllInvoices").doc(id).update(updates);
    document.getElementById("updateInvoiceModal").style.display = "none";
    fetchInvoices();
  } catch (e) {
    alert("هەڵە لە نوێکردنەوە");
  }
}

async function loadManualInvoicePrices() {
  const snap = await db1.collection("ManualInvoices").get();
  snap.forEach((doc) => {
    manualInvoicePrices[doc.id] = doc.data().price || 0;
  });
}

function showManualMonthlyReport() {
  document.getElementById("manualInvoiceModal").style.display = "none";
  const date = document.getElementById("reportDate").value;
  const monthVal = date ? date.substring(0, 7) : "";
  document.getElementById("manualMonthPicker").value = monthVal;
  document.getElementById("manualMonthlyModal").style.display = "flex";
  if (monthVal) loadManualMonthlyData(monthVal);
}

async function loadManualMonthlyData(month) {
  if (!month) return;
  document.getElementById("manualMonthlyContent").innerHTML =
    '<p style="text-align:center;padding:20px;">⏳ چاوەڕێ بکە...</p>';

  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();

  const promises = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    promises.push(
      db1.collection("ManualInvoices").doc(dateStr).get()
        .then((doc) => ({ dateStr, price: doc.exists ? (doc.data().price || 0) : 0 }))
        .catch(() => ({ dateStr, price: 0 }))
    );
  }

  const results = await Promise.all(promises);
  let rows = "";
  let grandTotal = 0;

  results.forEach(({ dateStr, price }) => {
    if (price > 0) {
      grandTotal += price;
      rows += `<tr>
        <td><b>${dateStr}</b></td>
        <td style="color:#27ae60;font-weight:bold;">${price.toLocaleString()} IQD</td>
      </tr>`;
    }
  });

  if (!rows) {
    document.getElementById("manualMonthlyContent").innerHTML =
      '<p style="text-align:center;color:gray;">هیچ وەسڵی دەستی نییە بۆ ئەم مانگە</p>';
    return;
  }

  document.getElementById("manualMonthlyContent").innerHTML = `
    <table>
      <thead><tr><th>بەروار</th><th>نرخی وەسڵی دەستی</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="background:#27ae60;color:white;padding:15px;border-radius:10px;text-align:center;margin-top:20px;">
      <div style="font-size:14px;opacity:.85;">کۆی گشتی وەسڵی دەستی</div>
      <div style="font-size:24px;font-weight:bold;">${grandTotal.toLocaleString()} IQD</div>
    </div>`;
}

function showDailyReport() {
  const date = document.getElementById("reportDate").value;
  if (!date) return alert("تکایە بەروار هەڵبژێرە!");

  const empMap = {};
  currentInvoices.forEach((inv) => {
    if (inv.status === "deleted" || inv.status === "canceled") return;
    const emp = inv.employee || "نادیار";
    if (!empMap[emp]) empMap[emp] = { nos: [], total: 0, hours: [] };
    const n = parseInt(inv.invoiceNo);
    if (!isNaN(n)) empMap[emp].nos.push(n);
    empMap[emp].total += parseInt(inv.price) || 0;
    if (inv.date && inv.date.includes(" ")) {
      const hour = parseInt(inv.date.split(" ")[1].split(":")[0]);
      if (!isNaN(hour)) empMap[emp].hours.push(hour);
    }
  });

  const entries = Object.entries(empMap);
  if (entries.length === 0) {
    document.getElementById("dailyReportContent").innerHTML =
      '<p style="text-align:center;color:gray;">هیچ داتایەک نییە</p>';
    document.getElementById("dailyReportModal").style.display = "flex";
    return;
  }

  let rows = "";
  let grandTotal = 0;
  entries.forEach(([name, data]) => {
    // FIX: use reduce instead of Math.min/max spread to avoid stack overflow on large arrays
    const min = data.nos.length ? data.nos.reduce((a, b) => Math.min(a, b)) : "—";
    const max = data.nos.length ? data.nos.reduce((a, b) => Math.max(a, b)) : "—";
    const range = min === max ? min : `${min}-${max}`;
    grandTotal += data.total;

    let shift = "—";
    if (data.hours.length) {
      const avgHour = data.hours.reduce((a, b) => a + b, 0) / data.hours.length;
      if (avgHour >= 8 && avgHour < 16) shift = "8-4";
      else if (avgHour >= 16) shift = "4-12";
      else shift = "12-8";
    }

    rows += `<tr>
      <td style="font-weight:bold;">${name}</td>
      <td>${shift}</td>
      <td>${range}</td>
      <td>${data.total.toLocaleString()} IQD</td>
    </tr>`;
  });

  document.getElementById("dailyReportContent").innerHTML = `
    <p style="text-align:center;color:#555;margin-bottom:15px;">بەروار: <b>${date}</b></p>
    <table>
      <thead><tr><th>ناوی کارمەند</th><th>کات</th><th>ژ.وەسڵ (لە - بۆ)</th><th>کۆی نرخ</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="background:var(--dark);color:white;padding:15px;border-radius:10px;text-align:center;margin-top:20px;">
      <div style="font-size:14px;opacity:.85;">کۆی گشتی داهات</div>
      <div style="font-size:24px;font-weight:bold;">${grandTotal.toLocaleString()} IQD</div>
    </div>`;
  document.getElementById("dailyReportModal").style.display = "flex";
}

function showMonthlyReport() {
  document.getElementById("monthlyReportModal").style.display = "flex";
  const date = document.getElementById("reportDate").value;
  if (date) {
    const monthVal = date.substring(0, 7);
    document.getElementById("monthPicker").value = monthVal;
    loadMonthlyData(monthVal);
  } else {
    document.getElementById("monthlyReportContent").innerHTML = "";
  }
}

async function loadMonthlyData(month) {
  if (!month) return;
  document.getElementById("monthlyReportContent").innerHTML =
    '<p style="text-align:center;padding:20px;">⏳ چاوەڕێ بکە...</p>';

  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();

  const promises = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    promises.push(
      db1
        .collection("Invoices")
        .doc(dateStr)
        .collection("AllInvoices")
        .get()
        .then((snap) => ({ dateStr, snap }))
        .catch(() => ({ dateStr, snap: null })),
    );
  }

  const results = await Promise.all(promises);

  let rows = "";
  let grandTotal = 0;
  let grandCount = 0;

  results.forEach(({ dateStr, snap }) => {
    if (!snap) return;
    let dayTotal = 0;
    let dayCount = 0;
    snap.forEach((doc) => {
      const data = doc.data();
      if (data.status !== "deleted" && data.status !== "canceled") {
        dayTotal += parseInt(data.price) || 0;
        dayCount++;
      }
    });
    if (dayCount > 0) {
      grandTotal += dayTotal;
      grandCount += dayCount;
      rows += `<tr>
        <td><b>${dateStr}</b></td>
        <td>${dayCount}</td>
        <td>${dayTotal.toLocaleString()} IQD</td>
      </tr>`;
    }
  });

  if (!rows) {
    document.getElementById("monthlyReportContent").innerHTML =
      '<p style="text-align:center;color:gray;">هیچ داتایەک نییە بۆ ئەم مانگە</p>';
    return;
  }

  document.getElementById("monthlyReportContent").innerHTML = `
    <table>
      <thead><tr><th>بەروار</th><th>ژمارەی وەسڵ</th><th>کۆی نرخ</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-top:20px;">
      <div style="background:var(--primary);color:white;padding:15px;border-radius:10px;text-align:center;">
        <div style="font-size:14px;opacity:.85;">کۆی وەسڵەکانی مانگ</div>
        <div style="font-size:24px;font-weight:bold;">${grandCount}</div>
      </div>
      <div style="background:var(--dark);color:white;padding:15px;border-radius:10px;text-align:center;">
        <div style="font-size:14px;opacity:.85;">کۆی داهاتی مانگ</div>
        <div style="font-size:24px;font-weight:bold;">${grandTotal.toLocaleString()} IQD</div>
      </div>
    </div>`;
}

function openMonthlyLineModal() {
  const date = document.getElementById("reportDate").value;
  const monthVal = date ? date.substring(0, 7) : "";
  document.getElementById("lineMonthPicker").value = monthVal;
  document.getElementById("monthlyLineContent").innerHTML = "";
  document.getElementById("monthlyLineModal").style.display = "flex";
  if (monthVal) loadMonthlyLineData(monthVal);
}

function printMonthlyLineReport() {
  const content = document.getElementById("monthlyLineContent").innerHTML;
  if (!content || content.includes("چاوەڕێ"))
    return alert("تکایە سەرەتا مانگێک هەڵبژێرە!");
  const month = document.getElementById("lineMonthPicker").value;
  document.getElementById("monthly-line-print-content").innerHTML =
    `<p style="text-align:center;color:#555;margin-bottom:5px;">مانگ: <b>${month}</b></p>` + content;
  const el = document.getElementById("monthly-line-print-area");
  document.body.classList.add("report-printing");
  el.classList.add("is-printing");
  window.print();
  el.classList.remove("is-printing");
  document.body.classList.remove("report-printing");
}

function showTaxiExitReport() {
  document.getElementById("taxiExitModal").style.display = "flex";
  const date = document.getElementById("reportDate").value;
  const monthVal = date ? date.substring(0, 7) : "";
  document.getElementById("taxiExitMonthPicker").value = monthVal;
  document.getElementById("taxiExitContent").innerHTML = "";
  if (monthVal) loadTaxiExitData(monthVal);
}

async function loadTaxiExitData(month) {
  const container = document.getElementById("taxiExitContent");
  if (!month) { container.innerHTML = ""; return; }

  container.innerHTML = '<p style="text-align:center;padding:15px;">⏳ چاوەڕێ بکە...</p>';

  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();

  const promises = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    promises.push(
      db1.collection("Invoices").doc(dateStr).collection("AllInvoices").get()
        .then((snap) => ({ snap }))
        .catch(() => ({ snap: null })),
    );
  }

  const results = await Promise.all(promises);

  const carLineMap = {};
  results.forEach(({ snap }) => {
    if (!snap) return;
    snap.forEach((doc) => {
      const data = doc.data();
      if (data.status === "deleted" || data.status === "canceled") return;
      const carNum = data.carNumber || "نادیار";
      const type = data.type || "نادیار";
      const line = data.line || "پارکینگ";
      const key = `${carNum}||${line}`;
      if (!carLineMap[key]) carLineMap[key] = { carNum, type, line, count: 0 };
      carLineMap[key].count++;
    });
  });

  taxiExitEntries = Object.values(carLineMap)
    .filter((d) => d.count > 1)
    .sort((a, b) => b.count - a.count);

  document.getElementById("taxiExitSearch").value = "";

  if (taxiExitEntries.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:gray;padding:10px;">هیچ ئۆتۆمبێلێکی دووبارە نییە بۆ ئەم مانگە</p>';
    return;
  }

  container.innerHTML = `
    <p style="text-align:center;color:#555;margin-bottom:10px;">مانگ: <b>${month}</b></p>
    <table>
      <thead>
        <tr><th>#</th><th>ژمارەی ئۆتۆمبێل</th><th>جۆری ئۆتۆمبێل</th><th>هێڵ</th><th>ژمارەی دەرچوون</th></tr>
      </thead>
      <tbody id="taxiExitTableBody"></tbody>
    </table>
    <div style="margin-top:15px;background:#c0392b;color:white;padding:14px;border-radius:10px;text-align:center;">
      <div style="font-size:13px;opacity:.85;">کۆی تەکسی دووبارەدەرچووە</div>
      <div style="font-size:24px;font-weight:bold;">${new Set(taxiExitEntries.map(d => d.carNum)).size}</div>
    </div>`;

  renderTaxiExitRows(taxiExitEntries);
}

function renderTaxiExitRows(list) {
  const tbody = document.getElementById("taxiExitTableBody");
  if (!tbody) return;
  tbody.innerHTML = list.map((data, i) =>
    `<tr>
      <td style="text-align:center;">${i + 1}</td>
      <td style="font-weight:bold;font-size:15px;">${data.carNum}</td>
      <td>${data.type}</td>
      <td>${data.line}</td>
      <td style="text-align:center;font-weight:bold;color:#c0392b;font-size:16px;">${data.count}</td>
    </tr>`
  ).join("");
}

function filterTaxiExitRows(query) {
  const q = query.trim();
  const filtered = q
    ? taxiExitEntries.filter(d => d.carNum.includes(q))
    : taxiExitEntries;
  renderTaxiExitRows(filtered);
}

function printTaxiExitReport() {
  const content = document.getElementById("taxiExitContent").innerHTML;
  if (!content || content.includes("چاوەڕێ"))
    return alert("تکایە سەرەتا مانگێک هەڵبژێرە!");
  document.getElementById("taxi-exit-print-content").innerHTML = content;
  const el = document.getElementById("taxi-exit-print-area");
  document.body.classList.add("report-printing");
  el.classList.add("is-printing");
  window.print();
  el.classList.remove("is-printing");
  document.body.classList.remove("report-printing");
}

let dailyTaxiExitEntries = [];

function showDailyTaxiExitReport() {
  document.getElementById("dailyTaxiExitModal").style.display = "flex";
  const date = document.getElementById("reportDate").value;
  document.getElementById("dailyTaxiExitDatePicker").value = date || "";
  document.getElementById("dailyTaxiExitSearch").value = "";
  document.getElementById("dailyTaxiExitContent").innerHTML = "";
  if (date) loadDailyTaxiExitData(date);
}

async function loadDailyTaxiExitData(date) {
  const container = document.getElementById("dailyTaxiExitContent");
  if (!date) { container.innerHTML = ""; return; }

  container.innerHTML = '<p style="text-align:center;padding:15px;">⏳ چاوەڕێ بکە...</p>';

  const snap = await db1
    .collection("Invoices").doc(date).collection("AllInvoices").get()
    .catch(() => null);

  const carLineMap = {};
  if (snap) {
    snap.forEach((doc) => {
      const data = doc.data();
      if (data.status === "deleted" || data.status === "canceled") return;
      const carNum = data.carNumber || "نادیار";
      const type = data.type || "نادیار";
      const line = data.line || "پارکینگ";
      const key = `${carNum}||${line}`;
      if (!carLineMap[key]) carLineMap[key] = { carNum, type, line, count: 0 };
      carLineMap[key].count++;
    });
  }

  dailyTaxiExitEntries = Object.values(carLineMap)
    .sort((a, b) => b.count - a.count);

  document.getElementById("dailyTaxiExitSearch").value = "";

  if (dailyTaxiExitEntries.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:gray;padding:10px;">هیچ داتایەک نییە بۆ ئەم ڕۆژە</p>';
    return;
  }

  const duplicateCount = dailyTaxiExitEntries.filter(d => d.count > 1).length;
  const totalCount = dailyTaxiExitEntries.length;

  container.innerHTML = `
    <p style="text-align:center;color:#555;margin-bottom:10px;">بەروار: <b>${date}</b></p>
    <table>
      <thead>
        <tr><th>#</th><th>ژمارەی ئۆتۆمبێل</th><th>جۆری ئۆتۆمبێل</th><th>هێڵ</th><th>ژمارەی دەرچوون</th></tr>
      </thead>
      <tbody id="dailyTaxiExitTableBody"></tbody>
    </table>
    <div style="margin-top:15px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div style="background:#922b21;color:white;padding:14px;border-radius:10px;text-align:center;">
        <div style="font-size:13px;opacity:.85;">ئۆتۆمبێلی دووبارەدەرچووە</div>
        <div style="font-size:24px;font-weight:bold;">${duplicateCount}</div>
      </div>
      <div style="background:#2c3e50;color:white;padding:14px;border-radius:10px;text-align:center;">
        <div style="font-size:13px;opacity:.85;">کۆی ئۆتۆمبێلەکان</div>
        <div style="font-size:24px;font-weight:bold;">${totalCount}</div>
      </div>
    </div>`;

  renderDailyTaxiExitRows(dailyTaxiExitEntries);
}

function renderDailyTaxiExitRows(list) {
  const tbody = document.getElementById("dailyTaxiExitTableBody");
  if (!tbody) return;
  tbody.innerHTML = list.map((data, i) => {
    const isDup = data.count > 1;
    const countStyle = isDup
      ? "color:#922b21;font-weight:bold;font-size:16px;"
      : "color:#7f8c8d;font-size:15px;";
    const rowStyle = isDup ? "" : "opacity:0.7;";
    return `<tr style="${rowStyle}">
      <td style="text-align:center;">${i + 1}</td>
      <td style="font-weight:bold;font-size:15px;">${data.carNum}</td>
      <td>${data.type}</td>
      <td>${data.line}</td>
      <td style="text-align:center;${countStyle}">${data.count}</td>
    </tr>`;
  }).join("");
}

function filterDailyTaxiExitRows(query) {
  const q = query.trim();
  const filtered = q
    ? dailyTaxiExitEntries.filter(d => d.carNum.includes(q))
    : dailyTaxiExitEntries;
  renderDailyTaxiExitRows(filtered);
}

function printDailyTaxiExitReport() {
  const content = document.getElementById("dailyTaxiExitContent").innerHTML;
  if (!content || content.includes("چاوەڕێ"))
    return alert("تکایە سەرەتا بەروارێک هەڵبژێرە!");
  document.getElementById("daily-taxi-exit-print-content").innerHTML = content;
  const el = document.getElementById("daily-taxi-exit-print-area");
  document.body.classList.add("report-printing");
  el.classList.add("is-printing");
  window.print();
  el.classList.remove("is-printing");
  document.body.classList.remove("report-printing");
}

async function loadMonthlyLineData(month) {
  const container = document.getElementById("monthlyLineContent");
  if (!month) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = '<p style="text-align:center;padding:15px;">⏳ چاوەڕێ بکە...</p>';

  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();

  const promises = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    promises.push(
      db1
        .collection("Invoices")
        .doc(dateStr)
        .collection("AllInvoices")
        .get()
        .then((snap) => ({ snap }))
        .catch(() => ({ snap: null })),
    );
  }

  const results = await Promise.all(promises);

  // Aggregate by line and type
  const lineMap = {};
  const allTypes = new Set();
  results.forEach(({ snap }) => {
    if (!snap) return;
    snap.forEach((doc) => {
      const data = doc.data();
      if (data.status === "deleted" || data.status === "canceled") return;
      const line = data.line || "پارکینگ";
      const type = data.type || "نادیار";
      allTypes.add(type);
      if (!lineMap[line]) lineMap[line] = { count: 0, total: 0, types: {} };
      if (!lineMap[line].types[type]) lineMap[line].types[type] = { count: 0, total: 0 };
      lineMap[line].count++;
      lineMap[line].total += parseInt(data.price) || 0;
      lineMap[line].types[type].count++;
      lineMap[line].types[type].total += parseInt(data.price) || 0;
    });
  });

  const entries = Object.entries(lineMap).sort((a, b) => b[1].total - a[1].total);

  if (entries.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:gray;padding:10px;">هیچ داتایەک نییە بۆ ئەم مانگە</p>';
    return;
  }

  const typeList = Array.from(allTypes).sort();
  const grandCount = entries.reduce((s, [, d]) => s + d.count, 0);
  const grandTotal = entries.reduce((s, [, d]) => s + d.total, 0);

  const typeHeaders = typeList.map(t => `<th>کۆی ${t}</th>`).join("");

  const rows = entries
    .map(([line, data]) => {
      const typeCells = typeList.map(t => {
        const td = data.types[t];
        return td
          ? `<td style="font-size:13px;">${td.total.toLocaleString()} IQD<br><span style="color:#888;font-size:11px;">${td.count} وەسڵ</span></td>`
          : `<td style="color:#ccc;">—</td>`;
      }).join("");
      return `<tr>
        <td style="font-weight:bold;">${line}</td>
        <td>${data.count}</td>
        ${typeCells}
      </tr>`;
    })
    .join("");

  container.innerHTML = `
    <p style="text-align:center;color:#555;margin-bottom:10px;">مانگ: <b>${month}</b></p>
    <table>
      <thead>
        <tr><th>هێڵ</th><th>ژ.وەسڵ</th>${typeHeaders}</tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:15px;">
      <div style="background:var(--primary);color:white;padding:14px;border-radius:10px;text-align:center;">
        <div style="font-size:13px;opacity:.85;">کۆی وەسڵ</div>
        <div style="font-size:24px;font-weight:bold;">${grandCount}</div>
      </div>
      <div style="background:var(--dark);color:white;padding:15px;border-radius:10px;text-align:center;">
        <div style="font-size:13px;opacity:.85;">کۆی داهات</div>
        <div style="font-size:24px;font-weight:bold;">${grandTotal.toLocaleString()} IQD</div>
      </div>
    </div>`;
}

function showCombinedMonthlyReport() {
  document.getElementById("combinedMonthlyModal").style.display = "flex";
  const date = document.getElementById("reportDate").value;
  if (date) {
    const monthVal = date.substring(0, 7);
    document.getElementById("combinedMonthPicker").value = monthVal;
    loadCombinedMonthlyData(monthVal);
  } else {
    document.getElementById("combinedMonthlyContent").innerHTML = "";
  }
}

async function loadCombinedMonthlyData(month) {
  if (!month) return;
  document.getElementById("combinedMonthlyContent").innerHTML =
    '<p style="text-align:center;padding:20px;">⏳ چاوەڕێ بکە...</p>';

  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();

  const invoicePromises = [];
  const manualPromises = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    invoicePromises.push(
      db1.collection("Invoices").doc(dateStr).collection("AllInvoices").get()
        .then((snap) => ({ dateStr, snap }))
        .catch(() => ({ dateStr, snap: null }))
    );
    manualPromises.push(
      db1.collection("ManualInvoices").doc(dateStr).get()
        .then((doc) => ({ dateStr, price: doc.exists ? (doc.data().price || 0) : 0 }))
        .catch(() => ({ dateStr, price: 0 }))
    );
  }

  const [invoiceResults, manualResults] = await Promise.all([
    Promise.all(invoicePromises),
    Promise.all(manualPromises),
  ]);

  const manualByDate = {};
  manualResults.forEach(({ dateStr, price }) => {
    manualByDate[dateStr] = price;
  });

  let rows = "";
  let grandManual = 0;
  let grandMonthly = 0;

  invoiceResults.forEach(({ dateStr, snap }) => {
    let dayTotal = 0;
    if (snap) {
      snap.forEach((doc) => {
        const data = doc.data();
        if (data.status !== "deleted" && data.status !== "canceled") {
          dayTotal += parseInt(data.price) || 0;
        }
      });
    }
    const manualPrice = manualByDate[dateStr] || 0;
    if (dayTotal === 0 && manualPrice === 0) return;

    grandManual += manualPrice;
    grandMonthly += dayTotal;
    const total = dayTotal + manualPrice;

    rows += `<tr>
      <td><b>${dateStr}</b></td>
      <td style="color:#27ae60;font-weight:bold;">${manualPrice > 0 ? manualPrice.toLocaleString() + " IQD" : "—"}</td>
      <td style="color:#2471a3;font-weight:bold;">${dayTotal > 0 ? dayTotal.toLocaleString() + " IQD" : "—"}</td>
      <td style="font-weight:bold;">${total.toLocaleString()} IQD</td>
    </tr>`;
  });

  if (!rows) {
    document.getElementById("combinedMonthlyContent").innerHTML =
      '<p style="text-align:center;color:gray;">هیچ داتایەک نییە بۆ ئەم مانگە</p>';
    return;
  }

  const grandTotal = grandManual + grandMonthly;

  document.getElementById("combinedMonthlyContent").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>بەروار</th>
          <th>نرخی وەسڵی دەستی</th>
          <th>نرخی مانگانەی پسووڵەکان</th>
          <th>کۆی گشتی</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:20px;">
      <div style="background:#eafaf1;border:2px solid #27ae60;padding:15px;border-radius:10px;text-align:center;">
        <div style="font-size:13px;color:#1e8449;font-weight:600;">کۆی وەسڵی دەستی</div>
        <div style="font-size:22px;font-weight:bold;color:#27ae60;">${grandManual.toLocaleString()} IQD</div>
      </div>
      <div style="background:#eaf4fb;border:2px solid #2471a3;padding:15px;border-radius:10px;text-align:center;">
        <div style="font-size:13px;color:#1a5276;font-weight:600;">کۆی پسووڵەکان</div>
        <div style="font-size:22px;font-weight:bold;color:#2471a3;">${grandMonthly.toLocaleString()} IQD</div>
      </div>
      <div style="background:#fef9e7;border:2px solid #d4ac0d;padding:15px;border-radius:10px;text-align:center;">
        <div style="font-size:13px;color:#9a7d0a;font-weight:600;">کۆی گشتی</div>
        <div style="font-size:22px;font-weight:bold;color:#d4ac0d;">${grandTotal.toLocaleString()} IQD</div>
      </div>
    </div>`;
}

function printCombinedMonthlyReport() {
  const content = document.getElementById("combinedMonthlyContent").innerHTML;
  if (!content || content.includes("چاوەڕێ"))
    return alert("تکایە سەرەتا مانگێک هەڵبژێرە!");
  const month = document.getElementById("combinedMonthPicker").value;
  document.getElementById("combined-monthly-print-content").innerHTML =
    `<p style="text-align:center;color:#555;margin-bottom:5px;">مانگ: <b>${month}</b></p>` + content;
  const el = document.getElementById("combined-monthly-print-area");
  document.body.classList.add("report-printing");
  el.classList.add("is-printing");
  window.print();
  el.classList.remove("is-printing");
  document.body.classList.remove("report-printing");
}
