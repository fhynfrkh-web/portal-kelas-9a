cat > src/portal/portal.js <<'EOF'
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

    document.query
