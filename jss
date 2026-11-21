/* =========================================================
   PORTAL KELAS 9A — JavaScript (tempel di panel JS CodePen)
   Database online: Lovable Cloud (tanpa login, data bersama,
   sinkron real-time antar perangkat).
   ========================================================= */

/* ---------- KONFIGURASI DATABASE ---------- */
var PORTAL_DB_URL = "https://c--4167f6ce-0dc3-47bb-aa4c-2e8c091b9415-prod.lovable.cloud";
var PORTAL_DB_KEY = "sb_publishable_onjoNEY0G9aZu-_4z8tLYw_VnjB_BoV";

/* KAS-LOGIC-START — rumus uang kas */
function kasStatus(kewajiban, dibayar) {
  if (dibayar >= kewajiban && kewajiban > 0) return "Lunas";
  if (dibayar > 0) return "Sebagian";
  return "Belum Bayar";
}
function kasKekurangan(kewajiban, dibayar) {
  // Kekurangan = Kewajiban − Pembayaran (tidak pernah minus)
  return Math.max(0, kewajiban - dibayar);
}
function kasRingkasan(members, payments, week, kewajiban) {
  var rows = members.map(function (m) {
    var list = payments.filter(function (p) { return p.member_id === m.id && Number(p.week) === Number(week); });
    var paid = list.reduce(function (s, p) { return s + Number(p.amount || 0); }, 0);
    return { member: m, payments: list, paid: paid, kurang: kasKekurangan(kewajiban, paid), status: kasStatus(kewajiban, paid) };
  });
  return {
    rows: rows,
    totalSiswa: members.length,
    lunas: rows.filter(function (r) { return r.status === "Lunas"; }).length,
    sebagian: rows.filter(function (r) { return r.status === "Sebagian"; }).length,
    belum: rows.filter(function (r) { return r.status === "Belum Bayar"; }).length,
    terkumpul: rows.reduce(function (s, r) { return s + r.paid; }, 0),
    kekurangan: rows.reduce(function (s, r) { return s + r.kurang; }, 0),
    target: members.length * kewajiban
  };
}
/* KAS-LOGIC-END */

(function () {
  "use strict";

  var db = window.supabase.createClient(PORTAL_DB_URL, PORTAL_DB_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  /* ---------- KONSTANTA ---------- */
  var DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  var MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  var STATUSES = ["Belum Dikerjakan", "Sedang Dikerjakan", "Selesai"];
  var TABLES = ["settings", "schedules", "pickets", "members", "tasks", "announcements", "kas_payments", "activity_log"];
  var DEFAULT_SETTINGS = { portal_name: "PORTAL KELAS", class_name: "9A", kas_nominal: 5000 };
  var NAV = [
    { id: "beranda", label: "Beranda", icon: "house" },
    { id: "jadwal", label: "Jadwal Pelajaran", short: "Jadwal", icon: "calendar-days" },
    { id: "piket", label: "Jadwal Piket", icon: "brush" },
    { id: "tugas", label: "Tugas", icon: "clipboard-list" },
    { id: "pengumuman", label: "Pengumuman", icon: "megaphone" },
    { id: "kas", label: "Uang Kas", short: "Kas", icon: "wallet" },
    { id: "anggota", label: "Anggota Kelas", icon: "users" },
    { id: "pengaturan", label: "Pengaturan", icon: "settings" }
  ];
  var BOTTOM = ["beranda", "jadwal", "tugas", "kas"];

  /* ---------- STATE ---------- */
  var state = {
    settings: Object.assign({}, DEFAULT_SETTINGS, readCache()),
    schedules: [], pickets: [], members: [], tasks: [], announcements: [], kas_payments: [], activity_log: [],
    loaded: false, error: false, realtime: false
  };
  var ui = {
    page: "beranda",
    jadwalDay: todayDay() === 0 ? 1 : todayDay(),
    kasWeek: currentWeek(),
    taskSearch: "", taskStatus: "Semua", taskSubject: "Semua",
    memberSearch: "", kasSearch: "", annSearch: ""
  };

  /* ---------- UTIL ---------- */
  function $(s) { return document.querySelector(s); }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function rupiah(n) { return "Rp" + Number(n || 0).toLocaleString("id-ID"); }
  function pad(n) { return String(n).padStart(2, "0"); }
  function todayDay() { return new Date().getDay(); }
  function todayISO() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function currentWeek() { return Math.min(5, Math.ceil(new Date().getDate() / 7)); }
  function toMin(t) { var p = String(t || "0:0").split(/[:.]/); return Number(p[0]) * 60 + Number(p[1] || 0); }
  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function fmtTime(t) { return String(t || "").slice(0, 5).replace(":", "."); }
  function parseDate(s) { return s ? new Date(s + "T00:00:00") : null; }
  function fmtDate(s, withDay) {
    var d = parseDate(s); if (!d || isNaN(d)) return "-";
    return (withDay ? DAYS[d.getDay()] + ", " : "") + d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  }
  function daysUntil(s) { var d = parseDate(s); if (!d) return null; var t = parseDate(todayISO()); return Math.round((d - t) / 86400000); }
  function timeAgo(iso) {
    var diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return "baru saja";
    if (diff < 3600) return Math.floor(diff / 60) + " menit lalu";
    if (diff < 86400) return Math.floor(diff / 3600) + " jam lalu";
    var d = new Date(iso); return d.getDate() + " " + MONTHS[d.getMonth()].slice(0, 3) + " " + pad(d.getHours()) + "." + pad(d.getMinutes());
  }
  function initials(name) { return String(name).trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase(); }
  function icons() { if (window.lucide) window.lucide.createIcons(); }
  function cls() { return state.settings.class_name || "9A"; }
  function portalName() { return state.settings.portal_name || "PORTAL KELAS"; }
  function nominal() { return Number(state.settings.kas_nominal) || 0; }
  function readCache() { try { return JSON.parse(localStorage.getItem("p9a-settings-cache") || "{}"); } catch (e) { return {}; } }
  function writeCache() { try { localStorage.setItem("p9a-settings-cache", JSON.stringify(state.settings)); } catch (e) {} }

  function schedulesOf(day) {
    return state.schedules.filter(function (s) { return Number(s.day) === day; })
      .sort(function (a, b) { return toMin(a.start_time) - toMin(b.start_time); });
  }
  function picketsOf(day) {
    return state.pickets.filter(function (p) { return Number(p.day) === day; })
      .sort(function (a, b) { return a.position - b.position || a.name.localeCompare(b.name); });
  }
  function membersSorted() {
    return state.members.slice().sort(function (a, b) { return a.number - b.number || a.name.localeCompare(b.name); });
  }
  function lessonStatus(s, day) {
    if (day !== todayDay()) return null;
    var m = nowMin();
    if (m >= toMin(s.end_time)) return "done";
    if (m >= toMin(s.start_time)) return "live";
    return "next";
  }
  function statusBadge(st) {
    if (st === "done") return '<span class="badge b-green"><i data-lucide="circle-check"></i> Selesai</span>';
    if (st === "live") return '<span class="badge b-orange"><span class="live-dot"></span> Berlangsung</span>';
    if (st === "next") return '<span class="badge b-blue"><i data-lucide="clock"></i> Akan Datang</span>';
    return "";
  }
  function taskBadge(status) {
    if (status === "Selesai") return '<span class="badge b-green"><i data-lucide="circle-check"></i> Selesai</span>';
    if (status === "Sedang Dikerjakan") return '<span class="badge b-teal"><i data-lucide="loader"></i> Sedang Dikerjakan</span>';
    return '<span class="badge b-orange"><i data-lucide="circle-alert"></i> Belum Dikerjakan</span>';
  }
  function kasBadge(status) {
    if (status === "Lunas") return '<span class="badge b-green"><i data-lucide="circle-check"></i> Lunas</span>';
    if (status === "Sebagian") return '<span class="badge b-orange"><i data-lucide="circle-dot"></i> Sebagian</span>';
    return '<span class="badge b-red"><i data-lucide="circle-x"></i> Belum Bayar</span>';
  }
  function deadlineInfo(t) {
    if (!t.deadline) return { text: "Tanpa deadline", cls: "" };
    var d = daysUntil(t.deadline);
    if (t.status === "Selesai") return { text: fmtDate(t.deadline), cls: "ok-text" };
    if (d < 0) return { text: fmtDate(t.deadline) + " · terlambat " + Math.abs(d) + " hari", cls: "late" };
    if (d === 0) return { text: "Hari ini", cls: "warn" };
    if (d === 1) return { text: "Besok", cls: "warn" };
    return { text: fmtDate(t.deadline) + " · " + d + " hari lagi", cls: d <= 3 ? "warn" : "" };
  }
  function activeTasks() {
    return state.tasks.filter(function (t) { return t.status !== "Selesai"; }).sort(function (a, b) {
      return (a.deadline || "9999").localeCompare(b.deadline || "9999");
    });
  }
  function annSorted(pinned) {
    return state.announcements.slice().sort(function (a, b) {
      if (pinned && a.important !== b.important) return a.important ? -1 : 1;
      return (b.date || "").localeCompare(a.date || "") || (b.created_at || "").localeCompare(a.created_at || "");
    });
  }
  function subjectList() {
    var set = {};
    state.schedules.forEach(function (s) { set[s.subject] = 1; });
    state.tasks.forEach(function (t) { set[t.subject] = 1; });
    return Object.keys(set).sort();
  }

  /* ---------- DATA ---------- */
  var ORDER = {
    schedules: ["start_time", true], pickets: ["position", true], members: ["number", true],
    tasks: ["created_at", false], announcements: ["date", false], kas_payments: ["paid_date", true], activity_log: ["created_at", false]
  };
  function fetchTable(t) {
    var q = db.from(t).select("*");
    if (ORDER[t]) q = q.order(ORDER[t][0], { ascending: ORDER[t][1] });
    if (t === "activity_log") q = q.limit(80);
    return q.then(function (res) {
      if (res.error) throw res.error;
      if (t === "settings") {
        var s = Object.assign({}, DEFAULT_SETTINGS);
        res.data.forEach(function (r) { s[r.key] = r.value; });
        state.settings = s; writeCache();
      } else {
        state[t] = res.data;
      }
    });
  }
  function loadAll(silent) {
    return Promise.all(TABLES.map(fetchTable)).then(function () {
      state.loaded = true; state.error = false; updateConn(); render();
    }).catch(function (e) {
      state.error = true; updateConn();
      if (!silent) toast("Gagal memuat data: " + (e.message || e), "error");
      if (!state.loaded) render();
    });
  }

  var pending = {}, refetchTimer = null;
  function scheduleRefetch(t) {
    pending[t] = 1;
    clearTimeout(refetchTimer);
    refetchTimer = setTimeout(function () {
      var list = Object.keys(pending); pending = {};
      Promise.all(list.map(fetchTable)).then(function () { state.error = false; updateConn(); render(); })
        .catch(function () { state.error = true; updateConn(); });
    }, 300);
  }
  function subscribe() {
    var ch = db.channel("portal-9a-" + Math.random().toString(36).slice(2));
    TABLES.forEach(function (t) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, function () { scheduleRefetch(t); });
    });
    ch.subscribe(function (status) {
      state.realtime = status === "SUBSCRIBED";
      updateConn();
    });
  }
  // Cadangan: jika real-time terputus, data diperbarui otomatis tiap 15 detik
  setInterval(function () { if (!state.realtime && navigator.onLine) loadAll(true); }, 15000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden && state.loaded) loadAll(true); });
  window.addEventListener("online", function () { updateConn(); loadAll(true); toast("Kembali online", "success"); });
  window.addEventListener("offline", function () { updateConn(); toast("Koneksi terputus. Perubahan belum bisa disimpan.", "warn"); });

  function log(action, detail) {
    db.from("activity_log").insert({ action: action, detail: detail || "" }).then(function () { scheduleRefetch("activity_log"); });
  }

  // Jalankan perubahan → tampilkan notifikasi → catat riwayat → muat ulang tabel
  function run(promise, opts) {
    return promise.then(function (res) {
      if (res && res.error) throw res.error;
      toast(opts.ok, "success");
      if (opts.log) log(opts.log[0], opts.log[1]);
      return Promise.all((opts.tables || []).map(fetchTable)).then(function () { render(); return true; });
    }).catch(function (e) {
      toast("Gagal: " + (e.message || e), "error");
      return false;
    });
  }

  /* ---------- KONEKSI ---------- */
  function updateConn() {
    var el = $("#conn"); if (!el) return;
    var text, c;
    if (!navigator.onLine) { text = "Offline"; c = "bad"; }
    else if (state.error) { text = "Gagal terhubung"; c = "bad"; }
    else if (!state.loaded) { text = "Menghubungkan…"; c = ""; }
    else if (state.realtime) { text = "Online · Real-time"; c = "ok"; }
    else { text = "Online · Auto-refresh"; c = "poll"; }
    el.className = "conn " + c;
    el.querySelector(".conn-text").textContent = text;
    el.title = "Status koneksi: " + text;
    var s = $("#connDetail"); if (s) s.textContent = text;
  }

  /* ---------- TEMA ---------- */
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("p9a-theme", t); } catch (e) {}
    var b = $("#themeBtn");
    if (b) { b.innerHTML = '<i data-lucide="' + (t === "dark" ? "sun" : "moon") + '"></i>'; }
    icons();
  }
  function currentTheme() { return document.documentElement.getAttribute("data-theme") || "light"; }
  (function () {
    var saved = null; try { saved = localStorage.getItem("p9a-theme"); } catch (e) {}
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", saved || (prefersDark ? "dark" : "light"));
  })();

  /* ---------- TOAST ---------- */
  function toast(msg, type) {
    type = type || "info";
    var icon = { success: "circle-check", error: "circle-x", warn: "triangle-alert", info: "info" }[type];
    var el = document.createElement("div");
    el.className = "toast " + type;
    el.innerHTML = '<i data-lucide="' + icon + '"></i><span>' + esc(msg) + "</span>";
    $("#toasts").appendChild(el); icons();
    setTimeout(function () { el.classList.add("out"); setTimeout(function () { el.remove(); }, 300); }, 3200);
  }

  /* ---------- MODAL ---------- */
  function showModal(html) {
    $("#modalBox").innerHTML = html;
    $("#modal").classList.add("show");
    $("#modal").setAttribute("aria-hidden", "false");
    icons();
    var first = $("#modalBox").querySelector("input:not([type=checkbox]),select,textarea");
    if (first && window.innerWidth > 640) setTimeout(function () { first.focus(); }, 80);
  }
  function closeModal() {
    $("#modal").classList.remove("show");
    $("#modal").setAttribute("aria-hidden", "true");
  }
  function fieldHtml(f) {
    var v = f.value == null ? "" : f.value;
    var req = f.required ? " required" : "";
    var id = "f_" + f.name;
    var input;
    if (f.type === "checkbox") {
      return '<label class="check"><input type="checkbox" name="' + f.name + '"' + (v ? " checked" : "") + "> " + esc(f.label) + "</label>";
    }
    if (f.type === "textarea") input = '<textarea id="' + id + '" name="' + f.name + '" placeholder="' + esc(f.placeholder || "") + '"' + req + ">" + esc(v) + "</textarea>";
    else if (f.type === "select") {
      input = '<select id="' + id + '" name="' + f.name + '"' + req + ">" + f.options.map(function (o) {
        var ov = typeof o === "object" ? o.value : o, ol = typeof o === "object" ? o.label : o;
        return '<option value="' + esc(ov) + '"' + (String(ov) === String(v) ? " selected" : "") + ">" + esc(ol) + "</option>";
      }).join("") + "</select>";
    } else {
      var list = f.datalist ? ' list="dl_' + f.name + '"' : "";
      input = '<input id="' + id + '" type="' + (f.type || "text") + '" name="' + f.name + '" value="' + esc(v) + '" placeholder="' + esc(f.placeholder || "") + '"' +
        (f.min != null ? ' min="' + f.min + '"' : "") + (f.step ? ' step="' + f.step + '"' : "") + list + req + ' autocomplete="off">';
      if (f.datalist) input += '<datalist id="dl_' + f.name + '">' + f.datalist.map(function (d) { return '<option value="' + esc(d) + '">'; }).join("") + "</datalist>";
    }
    return '<div class="field' + (f.half ? " half" : "") + '"><label for="' + id + '">' + esc(f.label) + "</label>" + input + "</div>";
  }
  function openForm(o) {
    showModal(
      '<div class="modal-head"><div class="card-icon ' + (o.color || "") + '"><i data-lucide="' + (o.icon || "pencil") + '"></i></div><h3>' + esc(o.title) + "</h3>" +
      '<button class="icon-btn" data-action="close-modal" aria-label="Tutup"><i data-lucide="x"></i></button></div>' +
      '<form class="form" id="modalForm" novalidate>' + o.fields.map(fieldHtml).join("") +
      '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Batal</button>' +
      '<button type="submit" class="btn btn-primary"><i data-lucide="save"></i> ' + esc(o.submit || "Simpan") + "</button></div></form>"
    );
    var form = $("#modalForm");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var values = {};
      var missing = null;
      o.fields.forEach(function (f) {
        var el = form.elements[f.name];
        values[f.name] = f.type === "checkbox" ? el.checked : String(el.value || "").trim();
        if (f.required && !values[f.name] && !missing) missing = f.label;
      });
      if (missing) { toast(missing + " wajib diisi", "warn"); return; }
      var btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      Promise.resolve(o.onSubmit(values)).then(function (ok) {
        btn.disabled = false;
        if (ok !== false) closeModal();
      });
    });
  }
  function confirmBox(o) {
    showModal(
      '<div class="confirm-icon"><i data-lucide="' + (o.icon || "trash-2") + '"></i></div>' +
      '<div class="confirm-text"><h3>' + esc(o.title) + "</h3><p>" + esc(o.message) + "</p></div>" +
      '<div class="form"><div class="modal-actions"><button class="btn btn-ghost" data-action="close-modal">Batal</button>' +
      '<button class="btn btn-danger" id="confirmYes"><i data-lucide="' + (o.icon || "trash-2") + '"></i> ' + esc(o.confirm || "Hapus") + "</button></div></div>"
    );
    $("#confirmYes").addEventListener("click", function () {
      this.disabled = true;
      Promise.resolve(o.onConfirm()).then(closeModal);
    });
  }

  /* ---------- NAVIGASI ---------- */
  function buildNav() {
    $("#sideNav").innerHTML = NAV.map(function (n, i) {
      return '<button class="nav-item" data-action="go" data-page="' + n.id + '"><i data-lucide="' + n.icon + '"></i>' + n.label + '<span class="nav-num">' + (i + 1) + "</span></button>";
    }).join("");
    $("#bottomNav").innerHTML = BOTTOM.map(function (id) {
      var n = NAV.filter(function (x) { return x.id === id; })[0];
      return '<button class="bn-item" data-action="go" data-page="' + n.id + '"><i data-lucide="' + n.icon + '"></i>' + (n.short || n.label) + "</button>";
    }).join("") + '<button class="bn-item" data-action="open-drawer" data-page="menu"><i data-lucide="layout-grid"></i>Menu</button>';
  }
  function go(page) {
    ui.page = page;
    closeDrawer();
    render(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function openDrawer() { $("#sidebar").classList.add("open"); $("#backdrop").classList.add("show"); }
  function closeDrawer() { $("#sidebar").classList.remove("open"); $("#backdrop").classList.remove("show"); }

  /* ---------- RENDER ---------- */
  function render(animate) {
    var full = portalName() + " " + cls();
    document.title = full;
    $("#brandName").textContent = full;
    $("#brandSub").textContent = "Kelas " + cls() + " · " + state.members.length + " Siswa";

    document.querySelectorAll("[data-action=go]").for Each(function (b) {
      b.classList.toggle("active", b.dataset.page === ui.page);
    });
    var inBottom = BOTTOM.indexOf(ui.page) >= 0;
    var menuBtn = document.querySelector('.bn-item[data-page="menu"]');
    if (menuBtn) menuBtn.classList.toggle("active", !inBottom);

    var view = $("#view");
    var a = document.activeElement, focusId = null, selStart = null, selEnd = null;
    if (a && a.id && view.contains(a)) {
      focusId = a.id;
      try { selStart = a.selectionStart; selEnd = a.selectionEnd; } catch (e) {}
    }
    var html = state.loaded ? PAGES[ui.page]() : skeleton();
    view.innerHTML = html;
    if (animate) { view.style.animation = "none"; void view.offsetWidth; view.style.animation = ""; }
    if (focusId) {
      var el = document.getElementById(focusId);
      if (el) { el.focus(); try { if (selStart != null) el.setSelectionRange(selStart, selEnd); } catch (e) {} }
    }
    icons();
    tick();
  }
  function skeleton() {
    if (state.error) {
      return '<div class="empty" style="padding:40px"><i data-lucide="wifi-off"></i><b>Tidak dapat terhubung ke database.</b><br>Periksa internet lalu coba lagi.<br><br>' +
        '<button class="btn btn-primary" data-action="retry"><i data-lucide="rotate-ccw"></i> Coba Lagi</button></div>';
    }
    return '<div class="skeleton" style="height:180px"></div><div class="skeleton"></div><div class="skeleton"></div>';
  }
  function pageHead(title, sub, icon, actions) {
    return '<div class="page-head"><div><h2><span class="ph-icon"><i data-lucide="' + icon + '"></i></span>' + esc(title) + "</h2>" +
      (sub ? "<p>" + sub + "</p>" : "") + "</div>" + (actions || "") + "</div>";
  }
  function emptyBox(icon, text) { return '<div class="empty"><i data-lucide="' + icon + '"></i>' + text + "</div>"; }

  function tick() {
    var now = new Date();
    var t = $("#clockTime"), d = $("#clockDate");
    if (t) t.textContent = pad(now.getHours()) + "." + pad(now.getMinutes()) + "." + pad(now.getSeconds());
    if (d) d.textContent = DAYS[now.getDay()] + ", " + now.getDate() + " " + MONTHS[now.getMonth()] + " " + now.getFullYear();
  }
  setInterval(tick, 1000);
  var lastMinute = nowMin();
  setInterval(function () {
    var m = nowMin();
    if (m !== lastMinute) { lastMinute = m; if (state.loaded && ["beranda", "jadwal", "tugas", "piket", "kas"].indexOf(ui.page) >= 0) render(); }
  }, 5000);

  /* ---------- HALAMAN: BERANDA ---------- */
  function pageBeranda() {
    var day = todayDay();
    var lessons = day === 0 ? [] : schedulesOf(day);
    var pk = picketsOf(day);
    var tasks = activeTasks();
    var anns = annSorted(false).slice(0, 3);
    var w = currentWeek();
    var kas = kasRingkasan(state.members, state.kas_payments, w, nominal());
    var pct = kas.target ? Math.round((kas.terkumpul / kas.target) * 100) : 0;

    var lessonHtml = lessons.length ? '<div class="mini-list">' + lessons.map(function (s) {
      return '<div class="mini-item"><div class="num" style="width:auto;padding:0 8px">' + fmtTime(s.start_time) + '</div><div class="mi-main"><b>' + esc(s.subject) + "</b><small>" +
        fmtTime(s.start_time) + "–" + fmtTime(s.end_time) + " · " + esc(s.teacher) + "</small></div>" + statusBadge(lessonStatus(s, day)) + "</div>";
    }).join("") + "</div>" : emptyBox("coffee", day === 0 ? "Hari Minggu — tidak ada pelajaran. Selamat beristirahat!" : "Belum ada jadwal untuk hari ini.");

    var picketHtml = pk.length ? '<div class="chips">' + pk.map(function (p, i) {
      return '<span class="chip"><span class="ava c' + (i % 6) + '">' + esc(initials(p.name)) + "</span>" + esc(p.name) + "</span>";
    }).join("") + "</div>" : emptyBox("sparkles", day === 0 ? "Hari Minggu — tidak ada piket." : "Belum ada petugas piket hari ini.");

    var taskHtml = tasks.length ? '<div class="mini-list">' + tasks.slice(0, 3).map(function (t) {
      var dl = deadlineInfo(t);
      return '<div class="mini-item"><div class="mi-main"><b>' + esc(t.title) + "</b><small>" + esc(t.subject) + ' · <span class="' + dl.cls + '">' + esc(dl.text) + "</span></small></div>" + taskBadge(t.status) + "</div>";
    }).join("") + "</div>" : emptyBox("party-popper", "Tidak ada tugas aktif.");

    var annHtml = anns.length ? '<div class="mini-list">' + anns.map(function (a) {
      return '<div class="mini-item"><div class="mi-main"><b>' + (a.important ? "⭐ " : "") + esc(a.title) + "</b><small>" + fmtDate(a.date) + (a.author ? " · " + esc(a.author) : "") + "</small></div></div>";
    }).join("") + "</div>" : emptyBox("megaphone", "Belum ada pengumuman.");

    return '<section class="hero"><div>' +
      '<p class="hero-eyebrow"><i data-lucide="sparkles"></i> Dashboard Kelas</p>' +
      "<h1>SELAMAT DATANG " + esc(cls()) + "!</h1>" +
      '<p class="hero-tag">“Satu portal untuk semua informasi kelas ' + esc(cls()) + '.”</p>' +
      '<div class="hero-chips"><span class="chip-light"><i data-lucide="school"></i> Kelas ' + esc(cls()) + " | " + state.members.length + " Siswa</span></div>" +
      '</div><div class="clock-card"><div class="clock-time" id="clockTime">--.--</div><div class="clock-date" id="clockDate"></div></div></section>' +
      '<div class="dash-grid">' +
      dashCard("Jadwal Hari Ini", "calendar-days", "", "jadwal", lessonHtml) +
      dashCard("Piket Hari Ini", "brush", "teal", "piket", picketHtml) +
      dashCard("Tugas Aktif", "clipboard-list", "purple", "tugas", '<div class="stat-row" style="margin-bottom:10px"><span class="big-num" style="color:var(--purple)">' + tasks.length + '</span><span class="hint" style="align-self:center">tugas belum selesai</span></div>' + taskHtml) +
      dashCard("Pengumuman Terbaru", "megaphone", "orange", "pengumuman", annHtml) +
      dashCard("Uang Kas Minggu Ini", "wallet", "green", "kas",
        '<p class="hint">Minggu ' + w + " · kewajiban " + rupiah(nominal()) + "/siswa</p>" +
        '<div class="stat-row" style="margin:8px 0"><span class="big-num" style="color:var(--green)">' + rupiah(kas.terkumpul) + '</span></div>' +
        '<div class="progress"><span style="width:' + Math.min(100, pct) + '%"></span></div>' +
        '<div class="chips" style="margin-top:10px"><span class="badge b-green">' + kas.lunas + ' Lunas</span><span class="badge b-orange">' + kas.sebagian + ' Sebagian</span><span class="badge b-red">' + kas.belum + " Belum</span></div>") +
      dashCard("Anggota Kelas", "users", "navy", "anggota",
        '<div class="stat-row"><span class="big-num">' + state.members.length + '</span><span class="hint" style="align-self:center">siswa terdaftar di kelas ' + esc(cls()) + "</span></div>" +
        '<div class="chips" style="margin-top:10px">' + membersSorted().slice(0, 6).map(function (m, i) {
          return '<span class="ava c' + (i % 6) + '" title="' + esc(m.name) + '" style="width:34px;height:34px;font-size:12px;margin-right:-14px;border:2px solid var(--card)">' + esc(initials(m.name)) + "</span>";
        }).join("") + "</div>") +
      "</div>";
  }
  function dashCard(title, icon, color, page, body) {
    return '<div class="card dash-card"><div class="card-head"><div class="card-icon ' + color + '"><i data-lucide="' + icon + '"></i></div><h3>' + title + "</h3>" +
      '<button class="link-btn" data-action="go" data-page="' + page + '">Lihat <i data-lucide="chevron-right"></i></button></div>' + body + "</div>";
  }

  /* ---------- HALAMAN: JADWAL PELAJARAN ---------- */
  function pageJadwal() {
    var d = ui.jadwalDay;
    var tabs = [1, 2, 3, 4, 5, 6].map(function (i) {
      return '<button class="tab' + (i === d ? " active" : "") + '" data-action="jadwal-day" data-day="' + i + '">' + (i === todayDay() ? '<span class="today-dot"></span>' : "") +
        DAYS[i] + '<span class="tab-count">' + schedulesOf(i).length + "</span></button>";
    }).join("");
    var list = schedulesOf(d);
    var body = list.length ? '<div class="lesson-list">' + list.map(function (s) {
      var st = lessonStatus(s, d);
      return '<div class="lesson ' + (st || "") + '"><div class="lesson-time">' + fmtTime(s.start_time) + "<span>" + fmtTime(s.end_time) + "</span></div>" +
        '<div class="lesson-body"><h4>' + esc(s.subject) + '</h4><p><i data-lucide="user-round"></i>' + esc(s.teacher || "-") + "</p></div>" +
        '<div class="lesson-side">' + statusBadge(st) + '<div class="row-actions">' +
        '<button class="icon-btn sm" data-action="edit-schedule" data-id="' + s.id + '" aria-label="Edit"><i data-lucide="pencil"></i></button>' +
        '<button class="icon-btn sm danger" data-action="del-schedule" data-id="' + s.id + '" aria-label="Hapus"><i data-lucide="trash-2"></i></button></div></div></div>';
    }).join("") + "</div>" : emptyBox("calendar-x", "Belum ada pelajaran di hari " + DAYS[d] + ".");
    return pageHead("Jadwal Pelajaran", "Status pelajaran mengikuti jam perangkat kamu.", "calendar-days",
      '<button class="btn btn-primary" data-action="add-schedule"><i data-lucide="plus"></i> Tambah Jadwal</button>') +
      '<div class="tabs">' + tabs + "</div>" + body;
  }
  function scheduleForm(s) {
    var isEdit = !!s; s = s || { day: ui.jadwalDay, start_time: "", end_time: "", subject: "", teacher: "" };
    openForm({
      title: isEdit ? "Edit Jadwal" : "Tambah Jadwal", icon: "calendar-days",
      fields: [
        { name: "day", label: "Hari", type: "select", value: s.day, options: [1, 2, 3, 4, 5, 6].map(function (i) { return { value: i, label: DAYS[i] }; }) },
        { name: "start_time", label: "Jam Mulai", type: "time", value: String(s.start_time).slice(0, 5), required: true, half: true },
        { name: "end_time", label: "Jam Selesai", type: "time", value: String(s.end_time).slice(0, 5), required: true, half: true },
        { name: "subject", label: "Mata Pelajaran", value: s.subject, required: true, datalist: subjectList(), placeholder: "cth. Matematika" },
        { name: "teacher", label: "Guru", value: s.teacher, placeholder: "cth. Pak Maulana" }
      ],
      onSubmit: function (v) {
        if (toMin(v.end_time) <= toMin(v.start_time)) { toast("Jam selesai harus setelah jam mulai", "warn"); return false; }
        var payload = { day: Number(v.day), start_time: v.start_time, end_time: v.end_time, subject: v.subject, teacher: v.teacher };
        ui.jadwalDay = payload.day;
        var q = isEdit ? db.from("schedules").update(payload).eq("id", s.id) : db.from("schedules").insert(payload);
        return run(q, { ok: isEdit ? "Jadwal diperbarui" : "Jadwal ditambahkan", tables: ["schedules"],
          log: [isEdit ? "Edit jadwal" : "Tambah jadwal", DAYS[payload.day] + " " + fmtTime(v.start_time) + " " + v.subject] });
      }
    });
  }

  /* ---------- HALAMAN: JADWAL PIKET ---------- */
  function pagePiket() {
    var today = todayDay();
    var cards = [1, 2, 3, 4, 5, 6].map(function (d) {
      var list = picketsOf(d);
      return '<div class="card picket-card' + (d === today ? " today" : "") + '"><div class="card-head"><div class="card-icon ' + (d === today ? "teal" : "") + '"><i data-lucide="brush"></i></div>' +
        "<h3>" + DAYS[d] + (d === today ? ' <span class="badge b-teal">Hari ini</span>' : "") + '</h3><span class="badge b-muted">' + list.length + " orang</span></div>" +
        (list.length ? '<div class="chips">' + list.map(function (p) {
          return '<span class="p-chip">' + esc(p.name) +
            '<button class="icon-btn" data-action="move-picket" data-id="' + p.id + '" title="Pindahkan" aria-label="Pindahkan"><i data-lucide="arrow-left-right"></i></button>' +
            '<button class="icon-btn" data-action="edit-picket" data-id="' + p.id + '" title="Edit" aria-label="Edit"><i data-lucide="pencil"></i></button>' +
            '<button class="icon-btn danger" data-action="del-picket" data-id="' + p.id + '" title="Hapus" aria-label="Hapus"><i data-lucide="x"></i></button></span>';
        }).join("") + "</div>" : emptyBox("user-plus", "Belum ada petugas.")) +
        '<button class="btn btn-ghost btn-sm btn-block" style="margin-top:12px" data-action="add-picket" data-day="' + d + '"><i data-lucide="plus"></i> Tambah Petugas</button></div>';
    }).join("");
    return pageHead("Jadwal Piket", "Kartu bertanda “Hari ini” otomatis tampil di Beranda.", "brush",
      '<button class="btn btn-primary" data-action="add-picket" data-day="' + (today === 0 ? 1 : today) + '"><i data-lucide="plus"></i> Tambah Petugas</button>') +
      '<div class="picket-grid">' + cards + "</div>";
  }
  function picketForm(p, day, moveOnly) {
    var isEdit = !!p; p = p || { name: "", day: day || 1 };
    var dayField = { name: "day", label: moveOnly ? "Pindahkan ke hari" : "Hari", type: "select", value: p.day, options: [1, 2, 3, 4, 5, 6].map(function (i) { return { value: i, label: DAYS[i] }; }) };
    var fields = moveOnly ? [dayField] : [
      { name: "name", label: "Nama Petugas", value: p.name, required: true, placeholder: "cth. Waldan", datalist: state.members.map(function (m) { return m.name; }) },
      dayField
    ];
    openForm({
      title: moveOnly ? "Pindahkan " + p.name : isEdit ? "Edit Petugas Piket" : "Tambah Petugas Piket", icon: moveOnly ? "arrow-left-right" : "brush", color: "teal",
      submit: moveOnly ? "Pindahkan" : "Simpan", fields: fields,
      onSubmit: function (v) {
        var newDay = Number(v.day);
        var pos = picketsOf(newDay).reduce(function (m, x) { return Math.max(m, x.position); }, 0) + 1;
        if (moveOnly) {
          return run(db.from("pickets").update({ day: newDay, position: pos }).eq("id", p.id),
            { ok: p.name + " dipindah ke " + DAYS[newDay], tables: ["pickets"], log: ["Pindah piket", p.name + ": " + DAYS[p.day] + " → " + DAYS[newDay]] });
        }
        if (isEdit) {
          var upd = { name: v.name, day: newDay };
          if (newDay !== Number(p.day)) upd.position = pos;
          return run(db.from("pickets").update(upd).eq("id", p.id),
            { ok: "Petugas piket diperbarui", tables: ["pickets"], log: ["Edit piket", v.name + " (" + DAYS[newDay] + ")"] });
        }
        return run(db.from("pickets").insert({ name: v.name, day: newDay, position: pos }),
          { ok: "Petugas piket ditambahkan", tables: ["pickets"], log: ["Tambah piket", v.name + " (" + DAYS[newDay] + ")"] });
      }
    });
  }

  /* ---------- HALAMAN: TUGAS ---------- */
  function pageTugas() {
    var q = ui.taskSearch.toLowerCase();
    var list = state.tasks.filter(function (t) {
      if (ui.taskStatus !== "Semua" && t.status !== ui.taskStatus) return false;
      if (ui.taskSubject !== "Semua" && t.subject !== ui.taskSubject) return false;
      if (q && (t.title + " " + t.description + " " + t.subject).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) {
      var sa = a.status === "Selesai" ? 1 : 0, sb = b.status === "Selesai" ? 1 : 0;
      return sa - sb || (a.deadline || "9999").localeCompare(b.deadline || "9999");
    });
    var subjects = ["Semua"].concat(subjectList());
    var counts = STATUSES.map(function (s) { return state.tasks.filter(function (t) { return t.status === s; }).length; });
    var body = list.length ? '<div class="list-grid">' + list.map(function (t) {
      var dl = deadlineInfo(t);
      return '<article class="item-card' + (t.status === "Selesai" ? " done" : "") + '"><div class="item-top"><span class="badge b-purple"><i data-lucide="book-open"></i>' + esc(t.subject) + '</span><span class="spacer"></span>' + taskBadge(t.status) + "</div>" +
        "<h4>" + esc(t.title) + "</h4>" + (t.description ? '<p class="desc">' + esc(t.description) + "</p>" : "") +
        '<div class="item-meta"><span><i data-lucide="calendar-plus"></i>Diberikan ' + fmtDate(t.given_date) + '</span><span class="' + dl.cls + '"><i data-lucide="alarm-clock"></i>Deadline ' + esc(dl.text) + "</span></div>" +
        '<div class="item-actions"><select class="inline-select" data-change="task-status" data-id="' + t.id + '" aria-label="Ubah status">' +
        STATUSES.map(function (s) { return "<option" + (s === t.status ? " selected" : "") + ">" + s + "</option>"; }).join("") + '</select><span class="spacer"></span>' +
        '<button class="icon-btn sm" data-action="edit-task" data-id="' + t.id + '" aria-label="Edit"><i data-lucide="pencil"></i></button>' +
        '<button class="icon-btn sm danger" data-action="del-task" data-id="' + t.id + '" aria-label="Hapus"><i data-lucide="trash-2"></i></button></div></article>';
    }).join("") + "</div>" : emptyBox("clipboard-list", state.tasks.length ? "Tidak ada tugas yang cocok dengan pencarian/filter." : "Belum ada tugas. Tekan “Tambah Tugas” untuk menambahkan.");
    return pageHead("Tugas", counts[0] + " belum · " + counts[1] + " sedang · " + counts[2] + " selesai", "clipboard-list",
      '<button class="btn btn-primary" data-action="add-task"><i data-lucide="plus"></i> Tambah Tugas</button>') +
      '<div class="toolbar"><div class="search"><i data-lucide="search"></i><input id="taskSearch" data-bind="taskSearch" value="' + esc(ui.taskSearch) + '" placeholder="Cari tugas…" autocomplete="off"></div>' +
      '<select id="taskStatus" data-bind="taskStatus" aria-label="Filter status">' + ["Semua"].concat(STATUSES).map(function (s) { return "<option" + (s === ui.taskStatus ? " selected" : "") + ">" + s + "</option>"; }).join("") + "</select>" +
      '<select id="taskSubject" data-bind="taskSubject" aria-label="Filter mapel">' + subjects.map(function (s) { return '<option value="' + esc(s) + '"' + (s === ui.taskSubject ? " selected" : "") + ">" + (s === "Semua" ? "Semua Mapel" : esc(s)) + "</option>"; }).join("") + "</select></div>" + body;
  }
  function taskForm(t) {
    var isEdit = !!t; t = t || { subject: "", title: "", description: "", given_date: todayISO(), deadline: "", status: "Belum Dikerjakan" };
    openForm({
      title: isEdit ? "Edit Tugas" : "Tambah Tugas", icon: "clipboard-list", color: "purple",
      fields: [
        { name: "subject", label: "Mata Pelajaran", value: t.subject, required: true, datalist: subjectList(), placeholder: "cth. IPA" },
        { name: "title", label: "Judul Tugas", value: t.title, required: true, placeholder: "cth. Rangkuman Bab 3" },
        { name: "description", label: "Deskripsi", type: "textarea", value: t.description, placeholder: "Detail tugas…" },
        { name: "given_date", label: "Tanggal Diberikan", type: "date", value: t.given_date, required: true, half: true },
        { name: "deadline", label: "Deadline", type: "date", value: t.deadline || "", half: true },
        { name: "status", label: "Status", type: "select", value: t.status, options: STATUSES }
      ],
      onSubmit: function (v) {
        var payload = { subject: v.subject, title: v.title, description: v.description, given_date: v.given_date, deadline: v.deadline || null, status: v.status };
        var q = isEdit ? db.from("tasks").update(payload).eq("id", t.id) : db.from("tasks").insert(payload);
        return run(q, { ok: isEdit ? "Tugas diperbarui" : "Tugas ditambahkan", tables: ["tasks"], log: [isEdit ? "Edit tugas" : "Tambah tugas", v.subject + ": " + v.title] });
      }
    });
  }

  /* ---------- HALAMAN: PENGUMUMAN ---------- */
  function pagePengumuman() {
    var q = ui.annSearch.toLowerCase();
    var list = annSorted(true).filter(function (a) { return !q || (a.title + " " + a.content + " " + a.author).toLowerCase().indexOf(q) >= 0; });
    var body = list.length ? '<div class="list-grid">' + list.map(function (a) {
      return '<article class="item-card ann' + (a.important ? " important" : "") + '"><div class="item-top">' +
        (a.important ? '<span class="badge b-orange"><i data-lucide="star"></i> Penting</span>' : '<span class="badge b-blue"><i data-lucide="megaphone"></i> Info</span>') +
        '<span class="spacer"></span><span class="hint">' + fmtDate(a.date, true) + "</span></div>" +
        "<h4>" + esc(a.title) + "</h4>" + (a.content ? '<p class="desc">' + esc(a.content) + "</p>" : "") +
        '<div class="item-actions"><span class="item-meta"><span><i data-lucide="user-round"></i>' + esc(a.author || "Tanpa nama") + '</span></span><span class="spacer"></span>' +
        '<button class="icon-btn sm" data-action="edit-ann" data-id="' + a.id + '" aria-label="Edit"><i data-lucide="pencil"></i></button>' +
        '<button class="icon-btn sm danger" data-action="del-ann" data-id="' + a.id + '" aria-label="Hapus"><i data-lucide="trash-2"></i></button></div></article>';
    }).join("") + "</div>" : emptyBox("megaphone", state.announcements.length ? "Tidak ada pengumuman yang cocok." : "Belum ada pengumuman. Tekan “Tambah Pengumuman”.");
    return pageHead("Pengumuman", "Pengumuman penting selalu tampil paling atas.", "megaphone",
      '<button class="btn btn-primary" data-action="add-ann"><i data-lucide="plus"></i> Tambah Pengumuman</button>') +
      '<div class="toolbar" style="grid-template-columns:1fr"><div class="search"><i data-lucide="search"></i><input id="annSearch" data-bind="annSearch" value="' + esc(ui.annSearch) + '" placeholder="Cari pengumuman…" autocomplete="off"></div></div>' + body;
  }
  function annForm(a) {
    var isEdit = !!a; a = a || { title: "", content: "", date: todayISO(), author: "", important: false };
    openForm({
      title: isEdit ? "Edit Pengumuman" : "Tambah Pengumuman", icon: "megaphone", color: "orange",
      fields: [
        { name: "title", label: "Judul", value: a.title, required: true },
        { name: "content", label: "Isi Pengumuman", type: "textarea", value: a.content },
        { name: "date", label: "Tanggal", type: "date", value: a.date, required: true, half: true },
        { name: "author", label: "Pembuat", value: a.author, placeholder: "cth. Ketua Kelas", half: true },
        { name: "important", label: "Tandai sebagai PENTING", type: "checkbox", value: a.important }
      ],
      onSubmit: function (v) {
        var payload = { title: v.title, content: v.content, date: v.date, author: v.author, important: !!v.important };
        var q = isEdit ? db.from("announcements").update(payload).eq("id", a.id) : db.from("announcements").insert(payload);
        return run(q, { ok: isEdit ? "Pengumuman diperbarui" : "Pengumuman ditambahkan", tables: ["announcements"], log: [isEdit ? "Edit pengumuman" : "Tambah pengumuman", v.title] });
      }
    });
  }

  /* ---------- HALAMAN: UANG KAS ---------- */
  function pageKas() {
    var w = ui.kasWeek, nom = nominal();
    var sum = kasRingkasan(membersSorted(), state.kas_payments, w, nom);
    var pct = sum.target ? Math.round((sum.terkumpul / sum.target) * 100) : 0;
    var q = ui.kasSearch.toLowerCase();
    var rows = sum.rows.filter(function (r) { return !q || r.member.name.toLowerCase().indexOf(q) >= 0; });
    var tabs = [1, 2, 3, 4, 5].map(function (i) {
      return '<button class="tab' + (i === w ? " active" : "") + '" data-action="kas-week" data-week="' + i + '">' + (i === currentWeek() ? '<span class="today-dot"></span>' : "") + "Minggu " + i + "</button>";
    }).join("");
    var stat = function (label, value, icon, c) { return '<div class="stat ' + c + '"><small><i data-lucide="' + icon + '"></i>' + label + "</small><b>" + value + "</b></div>"; };
    var anyPay = sum.rows.some(function (r) { return r.payments.length; });
    var list = rows.length ? '<div class="kas-list">' + rows.map(function (r, i) {
      return '<div class="kas-row"><div class="kas-main"><span class="num">' + (sum.rows.indexOf(r) + 1) + '</span><div class="kas-info"><b>' + esc(r.member.name) + "</b>" +
        "<small>Dibayar " + rupiah(r.paid) + " · Kurang " + rupiah(r.kurang) + '</small></div><div class="kas-side">' + kasBadge(r.status) +
        '<button class="btn btn-primary btn-sm" data-action="pay" data-member="' + r.member.id + '"><i data-lucide="plus"></i> Bayar</button></div></div>' +
        (r.payments.length ? '<div class="pay-hist">' + r.payments.map(function (p) {
          return '<div class="pay-item"><i data-lucide="receipt"></i><div class="pi-main"><b>' + rupiah(p.amount) + "</b> <small>· " + fmtDate(p.paid_date) + (p.note ? " · " + esc(p.note) : "") + "</small></div>" +
            '<button class="icon-btn sm" data-action="edit-pay" data-id="' + p.id + '" aria-label="Edit"><i data-lucide="pencil"></i></button>' +
            '<button class="icon-btn sm danger" data-action="del-pay" data-id="' + p.id + '" aria-label="Hapus"><i data-lucide="trash-2"></i></button></div>';
        }).join("") + "</div>" : "") + "</div>";
    }).join("") + "</div>" : emptyBox("search-x", "Siswa tidak ditemukan.");
    return pageHead("Uang Kas Kelas " + cls(), "Kekurangan = Kewajiban − Pembayaran. Status dihitung otomatis.", "wallet") +
      '<div class="card nominal-bar"><div class="nb-text"><small>Kewajiban per siswa per minggu</small><b>' + rupiah(nom) + "</b></div>" +
      '<button class="btn btn-ghost btn-sm" data-action="edit-nominal"><i data-lucide="pencil"></i> Ubah Nominal</button></div>' +
      '<div class="tabs">' + tabs + "</div>" +
      '<div class="stats">' +
      stat("Total Siswa", sum.totalSiswa, "users", "s-blue") +
      stat("Sudah Bayar (Lunas)", sum.lunas, "circle-check", "s-green") +
      stat("Belum Bayar", sum.belum, "circle-x", "s-red") +
      stat("Bayar Sebagian", sum.sebagian, "circle-dot", "s-orange") +
      stat("Total Terkumpul", rupiah(sum.terkumpul), "coins", "s-teal") +
      stat("Total Kekurangan", rupiah(sum.kekurangan), "triangle-alert", "s-red") +
      "</div>" +
      '<div class="card plain" style="margin-bottom:14px"><div class="nominal-bar" style="margin:0 0 8px"><span class="hint">Progres Minggu ' + w + "</span><b>" + pct + "% dari " + rupiah(sum.target) + "</b></div>" +
      '<div class="progress"><span style="width:' + Math.min(100, pct) + '%"></span></div>' +
      (anyPay ? "" : '<p class="hint" style="margin-top:10px">Belum ada data pembayaran untuk minggu ini. Tekan “Bayar” pada nama siswa untuk mencatat.</p>') + "</div>" +
      '<div class="toolbar" style="grid-template-columns:1fr"><div class="search"><i data-lucide="search"></i><input id="kasSearch" data-bind="kasSearch" value="' + esc(ui.kasSearch) + '" placeholder="Cari nama siswa…" autocomplete="off"></div></div>' +
      list;
  }
  function payForm(p, memberId) {
    var isEdit = !!p;
    var week = isEdit ? p.week : ui.kasWeek;
    var mid = isEdit ? p.member_id : memberId;
    var paid = state.kas_payments.filter(function (x) { return x.member_id === mid && Number(x.week) === Number(week); }).reduce(function (s, x) { return s + x.amount; }, 0);
    var suggested = isEdit ? p.amount : (kasKekurangan(nominal(), paid) || nominal());
    p = p || { member_id: mid, week: week, amount: suggested, paid_date: todayISO(), note: "" };
    openForm({
      title: isEdit ? "Edit Pembayaran" : "Catat Pembayaran Kas", icon: "wallet", color: "green",
      fields: [
        { name: "member_id", label: "Nama Siswa", type: "select", value: p.member_id, options: membersSorted().map(function (m) { return { value: m.id, label: m.name }; }) },
        { name: "week", label: "Minggu", type: "select", value: p.week, half: true, options: [1, 2, 3, 4, 5].map(function (i) { return { value: i, label: "Minggu " + i }; }) },
        { name: "amount", label: "Nominal (Rp)", type: "number", value: p.amount, min: 1, step: 500, required: true, half: true },
        { name: "paid_date", label: "Tanggal", type: "date", value: p.paid_date, required: true },
        { name: "note", label: "Catatan", value: p.note, placeholder: "opsional" }
      ],
      onSubmit: function (v) {
        var amount = Math.round(Number(v.amount));
        if (!(amount > 0)) { toast("Nominal harus lebih dari 0", "warn"); return false; }
        var m = state.members.filter(function (x) { return x.id === v.member_id; })[0];
        var payload = { member_id: v.member_id, week: Number(v.week), amount: amount, paid_date: v.paid_date, note: v.note };
        ui.kasWeek = payload.week;
        var q = isEdit ? db.from("kas_payments").update(payload).eq("id", p.id) : db.from("kas_payments").insert(payload);
        return run(q, { ok: isEdit ? "Pembayaran diperbarui" : "Pembayaran dicatat", tables: ["kas_payments"],
          log: [isEdit ? "Edit pembayaran kas" : "Bayar kas", (m ? m.name : "") + " · Minggu " + payload.week + " · " + rupiah(amount)] });
      }
    });
  }
  function nominalForm() {
    openForm({
      title: "Ubah Nominal Kas", icon: "coins", color: "green",
      fields: [{ name: "kas_nominal", label: "Kewajiban per siswa per minggu (Rp)", type: "number", value: nominal(), min: 0, step: 500, required: true }],
      onSubmit: function (v) { return saveSettings({ kas_nominal: Math.round(Number(v.kas_nominal) || 0) }); }
    });
  }

  /* ---------- HALAMAN: ANGGOTA ---------- */
  function pageAnggota() {
    var q = ui.memberSearch.toLowerCase();
    var all = membersSorted();
    var list = all.filter(function (m) { return !q || m.name.toLowerCase().indexOf(q) >= 0; });
    var body = list.length ? '<div class="member-grid">' + list.map(function (m) {
      var i = all.indexOf(m);
      return '<div class="member"><span class="num">' + (i + 1) + '</span><span class="ava c' + (i % 6) + '">' + esc(initials(m.name)) + '</span><div class="member-info"><b>' + esc(m.name) + "</b><small>Siswa Kelas " + esc(cls()) + "</small></div>" +
        '<div class="row-actions"><button class="icon-btn sm" data-action="edit-member" data-id="' + m.id + '" aria-label="Edit"><i data-lucide="pencil"></i></button>' +
        '<button class="icon-btn sm danger" data-action="del-member" data-id="' + m.id + '" aria-label="Hapus"><i data-lucide="trash-2"></i></button></div></div>';
    }).join("") + "</div>" : emptyBox("search-x", all.length ? "Anggota tidak ditemukan." : "Belum ada anggota.");
    return pageHead("Anggota Kelas", "Total " + all.length + " siswa" + (q ? " · " + list.length + " cocok" : ""), "users",
      '<button class="btn btn-primary" data-action="add-member"><i data-lucide="user-plus"></i> Tambah Anggota</button>') +
      '<div class="toolbar" style="grid-template-columns:1fr"><div class="search"><i data-lucide="search"></i><input id="memberSearch" data-bind="memberSearch" value="' + esc(ui.memberSearch) + '" placeholder="Cari nama anggota…" autocomplete="off"></div></div>' + body;
  }
  function memberForm(m) {
    var isEdit = !!m;
    openForm({
      title: isEdit ? "Edit Anggota" : "Tambah Anggota", icon: "user-plus", color: "navy",
      fields: [{ name: "name", label: "Nama Lengkap", value: m ? m.name : "", required: true }],
      onSubmit: function (v) {
        if (isEdit) return run(db.from("members").update({ name: v.name }).eq("id", m.id), { ok: "Anggota diperbarui", tables: ["members"], log: ["Edit anggota", m.name + " → " + v.name] });
        var num = state.members.reduce(function (x, y) { return Math.max(x, y.number); }, 0) + 1;
        return run(db.from("members").insert({ name: v.name, number: num }), { ok: "Anggota ditambahkan", tables: ["members"], log: ["Tambah anggota", v.name] });
      }
    });
  }

  /* ---------- HALAMAN: PENGATURAN ---------- */
  function pagePengaturan() {
    var th = currentTheme();
    var logs = state.activity_log.slice(0, 50);
    return pageHead("Pengaturan", "Perubahan di sini berlaku untuk semua pengguna (kecuali tema).", "settings") +
      '<div class="settings-grid">' +
      '<div class="card"><div class="card-head"><div class="card-icon"><i data-lucide="school"></i></div><h3>Identitas Portal</h3></div>' +
      '<div class="form"><div class="field"><label for="setPortal">Nama Portal</label><input id="setPortal" value="' + esc(portalName()) + '"></div>' +
      '<div class="field half"><label for="setClass">Nama Kelas</label><input id="setClass" value="' + esc(cls()) + '"></div>' +
      '<div class="field half"><label for="setNominal">Nominal Kas (Rp)</label><input id="setNominal" type="number" min="0" step="500" value="' + nominal() + '"></div>' +
      '<div class="modal-actions"><button class="btn btn-primary" data-action="save-settings"><i data-lucide="save"></i> Simpan Pengaturan</button></div></div></div>' +

      '<div class="card"><div class="card-head"><div class="card-icon teal"><i data-lucide="palette"></i></div><h3>Tema Tampilan</h3></div>' +
      '<div class="theme-switch"><button class="theme-opt' + (th === "light" ? " active" : "") + '" data-action="set-theme" data-theme="light"><i data-lucide="sun"></i> Terang</button>' +
      '<button class="theme-opt' + (th === "dark" ? " active" : "") + '" data-action="set-theme" data-theme="dark"><i data-lucide="moon"></i> Gelap</button></div>' +
      '<p class="hint" style="margin-top:10px">Tema disimpan di perangkat ini saja.</p>' +
      '<div class="section-title">Koneksi</div><p class="hint"><b id="connDetail"></b><br>Database online: Lovable Cloud. Perubahan tersimpan di server dan langsung terlihat di perangkat lain (real-time). Jika real-time terputus, data diperbarui otomatis tiap 15 detik.</p>' +
      '<div class="btn-row" style="margin-top:10px"><button class="btn btn-ghost btn-sm" data-action="retry"><i data-lucide="refresh-cw"></i> Muat Ulang Data</button></div></div>' +

      '<div class="card"><div class="card-head"><div class="card-icon green"><i data-lucide="database"></i></div><h3>Export / Import Data</h3></div>' +
      '<p class="hint">Simpan cadangan seluruh data ke file JSON, atau pulihkan dari file cadangan. Import akan <b>mengganti semua data</b>.</p>' +
      '<div class="btn-row" style="margin-top:12px"><button class="btn btn-teal" data-action="export"><i data-lucide="download"></i> Export JSON</button>' +
      '<button class="btn btn-ghost" data-action="import"><i data-lucide="upload"></i> Import JSON</button></div>' +
      '<div class="section-title">Reset Data</div><div class="btn-row">' +
      '<button class="btn btn-danger btn-sm" data-action="reset" data-what="kas"><i data-lucide="rotate-ccw"></i> Reset Uang Kas</button>' +
      '<button class="btn btn-danger btn-sm" data-action="reset" data-what="tasks"><i data-lucide="trash-2"></i> Hapus Semua Tugas</button>' +
      '<button class="btn btn-danger btn-sm" data-action="reset" data-what="ann"><i data-lucide="trash-2"></i> Hapus Semua Pengumuman</button>' +
      '<button class="btn btn-danger btn-sm" data-action="reset" data-what="log"><i data-lucide="history"></i> Hapus Riwayat</button></div></div>' +

      '<div class="card"><div class="card-head"><div class="card-icon navy"><i data-lucide="history"></i></div><h3>Riwayat Perubahan</h3><span class="badge b-muted">' + logs.length + "</span></div>" +
      (logs.length ? '<div class="log-list">' + logs.map(function (l) {
        return '<div class="log-item"><div class="log-main"><b>' + esc(l.action) + "</b><br><span class=\"hint\">" + esc(l.detail) + "</span></div><small>" + timeAgo(l.created_at) + "</small></div>";
      }).join("") + "</div>" : emptyBox("history", "Belum ada perubahan.")) + "</div>" +
      "</div>";
  }
  function saveSettings(obj) {
    var rows = Object.keys(obj).map(function (k) { return { key: k, value: obj[k], updated_at: new Date().toISOString() }; });
    return run(db.from("settings").upsert(rows), { ok: "Pengaturan disimpan", tables: ["settings"],
      log: ["Ubah pengaturan", Object.keys(obj).map(function (k) { return k + " = " + obj[k]; }).join(", ")] });
  }
  function exportData() {
    var data = {};
    TABLES.forEach(function (t) {
      if (t === "activity_log") return;
      if (t === "settings") data.settings = Object.keys(state.settings).map(function (k) { return { key: k, value: state.settings[k] }; });
      else data[t] = state[t];
    });
    var blob = new Blob([JSON.stringify({ app: "portal-kelas-9a", version: 1, exported_at: new Date().toISOString(), data: data }, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "portal-kelas-" + cls() + "-" + todayISO() + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    toast("Data berhasil di-export", "success");
    log("Export data", "File JSON");
  }
  function importData(json) {
    var d = json && json.data ? json.data : json;
    if (!d || !Array.isArray(d.members) || !Array.isArray(d.schedules)) { toast("File JSON tidak valid", "error"); return; }
    confirmBox({
      title: "Import data?", icon: "upload", confirm: "Ganti Semua Data",
      message: "Semua data saat ini (jadwal, piket, tugas, pengumuman, kas, anggota) akan diganti dengan isi file. Tindakan ini berlaku untuk semua pengguna.",
      onConfirm: function () {
        var del = ["kas_payments", "tasks", "announcements", "pickets", "schedules", "members"];
        var ins = ["members", "schedules", "pickets", "tasks", "announcements", "kas_payments"];
        var chain = Promise.resolve();
        del.forEach(function (t) { chain = chain.then(function () { return db.from(t).delete().not("id", "is", null).then(check); }); });
        ins.forEach(function (t) {
          chain = chain.then(function () { return Array.isArray(d[t]) && d[t].length ? db.from(t).insert(d[t]).then(check) : null; });
        });
        chain = chain.then(function () { return Array.isArray(d.settings) && d.settings.length ? db.from("settings").upsert(d.settings.map(function (s) { return { key: s.key, value: s.value }; })).then(check) : null; });
        return chain.then(function () {
          toast("Import berhasil", "success"); log("Import data", "Semua data diganti dari file JSON"); return loadAll();
        }).catch(function (e) { toast("Import gagal: " + (e.message || e), "error"); loadAll(true); });
      }
    });
  }
  function check(res) { if (res && res.error) throw res.error; return res; }
  function resetData(what) {
    var map = {
      kas: ["kas_payments", "Reset uang kas", "Semua catatan pembayaran kas (Minggu 1–5) akan dihapus."],
      tasks: ["tasks", "Hapus semua tugas", "Semua tugas akan dihapus permanen."],
      ann: ["announcements", "Hapus semua pengumuman", "Semua pengumuman akan dihapus permanen."],
      log: ["activity_log", "Hapus riwayat", "Seluruh riwayat perubahan akan dihapus."]
    }[what];
    confirmBox({
      title: map[1] + "?", message: map[2] + " Tindakan ini berlaku untuk semua pengguna dan tidak bisa dibatalkan.", confirm: "Ya, Hapus", icon: "rotate-ccw",
      onConfirm: function () {
        return run(db.from(map[0]).delete().not("id", "is", null), { ok: map[1] + " berhasil", tables: [map[0]], log: what === "log" ? null : [map[1], "Reset data"] });
      }
    });
  }

  var PAGES = { beranda: pageBeranda, jadwal: pageJadwal, piket: pagePiket, tugas: pageTugas, pengumuman: pagePengumuman, kas: pageKas, anggota: pageAnggota, pengaturan: pagePengaturan };

  /* ---------- EVENT ---------- */
  function byId(table, id) { return state[table].filter(function (x) { return x.id === id; })[0]; }
  var ACTIONS = {
    "go": function (d) { go(d.page); },
    "open-drawer": openDrawer,
    "close-drawer": closeDrawer,
    "close-modal": closeModal,
    "toggle-theme": function () { applyTheme(currentTheme() === "dark" ? "light" : "dark"); if (ui.page === "pengaturan") render(); },
    "set-theme": function (d) { applyTheme(d.theme); render(); },
    "retry": function () { state.error = false; updateConn(); render(); loadAll(); },
    "jadwal-day": function (d) { ui.jadwalDay = Number(d.day); render(); },
    "add-schedule": function () { scheduleForm(null); },
    "edit-schedule": function (d) { scheduleForm(byId("schedules", d.id)); },
    "del-schedule": function (d) {
      var s = byId("schedules", d.id);
      confirmBox({ title: "Hapus jadwal?", message: s.subject + " (" + DAYS[s.day] + ", " + fmtTime(s.start_time) + "–" + fmtTime(s.end_time) + ") akan dihapus.",
        onConfirm: function () { return run(db.from("schedules").delete().eq("id", s.id), { ok: "Jadwal dihapus", tables: ["schedules"], log: ["Hapus jadwal", DAYS[s.day] + " " + s.subject] }); } });
    },
    "add-picket": function (d) { picketForm(null, Number(d.day)); },
    "edit-picket": function (d) { picketForm(byId("pickets", d.id)); },
    "move-picket": function (d) { picketForm(byId("pickets", d.id), null, true); },
    "del-picket": function (d) {
      var p = byId("pickets", d.id);
      confirmBox({ title: "Hapus petugas piket?", message: p.name + " akan dihapus dari piket hari " + DAYS[p.day] + ".",
        onConfirm: function () { return run(db.from("pickets").delete().eq("id", p.id), { ok: "Petugas piket dihapus", tables: ["pickets"], log: ["Hapus piket", p.name + " (" + DAYS[p.day] + ")"] }); } });
    },
    "add-task": function () { taskForm(null); },
    "edit-task": function (d) { taskForm(byId("tasks", d.id)); },
    "del-task": function (d) {
      var t = byId("tasks", d.id);
      confirmBox({ title: "Hapus tugas?", message: "“" + t.title + "” akan dihapus permanen.",
        onConfirm: function () { return run(db.from("tasks").delete().eq("id", t.id), { ok: "Tugas dihapus", tables: ["tasks"], log: ["Hapus tugas", t.title] }); } });
    },
    "add-ann": function () { annForm(null); },
    "edit-ann": function (d) { annForm(byId("announcements", d.id)); },
    "del-ann": function (d) {
      var a = byId("announcements", d.id);
      confirmBox({ title: "Hapus pengumuman?", message: "“" + a.title + "” akan dihapus permanen.",
        onConfirm: function () { return run(db.from("announcements").delete().eq("id", a.id), { ok: "Pengumuman dihapus", tables: ["announcements"], log: ["Hapus pengumuman", a.title] }); } });
    },
    "kas-week": function (d) { ui.kasWeek = Number(d.week); render(); },
    "pay": function (d) { payForm(null, d.member); },
    "edit-pay": function (d) { payForm(byId("kas_payments", d.id)); },
    "del-pay": function (d) {
      var p = byId("kas_payments", d.id), m = byId("members", p.member_id);
      confirmBox({ title: "Hapus pembayaran?", message: rupiah(p.amount) + " dari " + (m ? m.name : "siswa") + " (Minggu " + p.week + ") akan dihapus.",
        onConfirm: function () { return run(db.from("kas_payments").delete().eq("id", p.id), { ok: "Pembayaran dihapus", tables: ["kas_payments"], log: ["Hapus pembayaran kas", (m ? m.name : "") + " · Minggu " + p.week + " · " + rupiah(p.amount)] }); } });
    },
    "edit-nominal": nominalForm,
    "add-member": function () { memberForm(null); },
    "edit-member": function (d) { memberForm(byId("members", d.id)); },
    "del-member": function (d) {
      var m = byId("members", d.id);
      confirmBox({ title: "Hapus anggota?", message: m.name + " akan dihapus dari kelas, termasuk catatan uang kasnya.",
        onConfirm: function () { return run(db.from("members").delete().eq("id", m.id), { ok: "Anggota dihapus", tables: ["members", "kas_payments"], log: ["Hapus anggota", m.name] }); } });
    },
    "save-settings": function () {
      var name = $("#setPortal").value.trim(), c = $("#setClass").value.trim(), n = Math.round(Number($("#setNominal").value) || 0);
      if (!name || !c) { toast("Nama portal dan kelas wajib diisi", "warn"); return; }
      saveSettings({ portal_name: name, class_name: c, kas_nominal: n });
    },
    "export": exportData,
    "import": function () { $("#importFile").value = ""; $("#importFile").click(); },
    "reset": function (d) { resetData(d.what); }
  };

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var fn = ACTIONS[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el.dataset, el); }
  });
  document.addEventListener("input", function (e) {
    var b = e.target.dataset && e.target.dataset.bind;
    if (b && e.target.tagName === "INPUT") { ui[b] = e.target.value; render(); }
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.bind && t.tagName === "SELECT") { ui[t.dataset.bind] = t.value; render(); }
    if (t.dataset && t.dataset.change === "task-status") {
      var task = byId("tasks", t.dataset.id);
      run(db.from("tasks").update({ status: t.value }).eq("id", t.dataset.id), { ok: "Status tugas: " + t.value, tables: ["tasks"], log: ["Ubah status tugas", (task ? task.title : "") + " → " + t.value] });
    }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeModal(); closeDrawer(); } });
  $("#importFile").addEventListener("change", function () {
    var f = this.files && this.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () { try { importData(JSON.parse(r.result)); } catch (err) { toast("File bukan JSON yang valid", "error"); } };
    r.readAsText(f);
  });

  /* ---------- MULAI ---------- */
  function start() {
    $("#splashTitle").textContent = portalName();
    $("#splashClass").textContent = cls();
    $("#splashTag").textContent = "“Satu portal untuk semua informasi kelas " + cls() + ".”";
    buildNav();
    applyTheme(currentTheme());
    render();
    updateConn();
    loadAll();
    subscribe();
    // Splash ±2 detik, hanya saat aplikasi dibuka
    setTimeout(function () {
      var s = $("#splash"); s.classList.add("hide");
      setTimeout(function () { s.remove(); }, 700);
    }, 2000);
  }
  start();
})();
