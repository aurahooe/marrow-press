const SUPA_URL = "https://tqfocdktvjuwoiyfgesb.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZm9jZGt0dmp1d29peWZnZXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDg0NTIsImV4cCI6MjEwNTQ4NDQ1Mn0.8TW4fQCQHc4c_xTNBEwOK3lSC9HYCbkTbfXuYQB-S8g";

const sb = supabase.createClient(SUPA_URL, SUPA_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = (id) => document.getElementById(id);
let session = null;
let profile = null;

document.querySelectorAll("[data-go]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.getElementById(btn.dataset.go)?.scrollIntoView({ behavior: "smooth" });
  });
});

const glow = $("glow");
window.addEventListener("pointermove", (e) => {
  glow.style.left = e.clientX + "px";
  glow.style.top = e.clientY + "px";
});

function hourKey(d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours()));
  return x.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:\d{2}Z$/, ":00Z");
}

function nextHour() {
  const n = new Date();
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), n.getUTCHours() + 1);
}

function tickClock() {
  const left = Math.max(0, nextHour() - Date.now());
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  $("countdown").textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} until reprint`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function snippet(s, n = 180) {
  s = (s || "").trim();
  return s.length > n ? s.slice(0, n).trim() + "…" : s;
}

async function loadHour() {
  const key = hourKey();
  $("hourKicker").textContent = "Edition — " + key.replace("T", " ").replace(":00:00Z", "h UTC");
  const { data } = await sb.from("marrow_hours").select("*").eq("hour_key", key).maybeSingle();
  if (data) {
    $("hourHeadline").textContent = data.headline;
    $("hourBlurb").textContent = data.blurb;
    if (data.featured_entry_id) {
      const { data: entry } = await sb.from("marrow_entries").select("*").eq("id", data.featured_entry_id).maybeSingle();
      if (entry && entry.is_public) {
        $("featured").hidden = false;
        $("featTitle").textContent = entry.title;
        $("featBody").textContent = entry.body;
        $("featBy").textContent = "Filed this hour";
      }
    }
  } else {
    $("hourHeadline").textContent = "The room is between editions.";
    $("hourBlurb").textContent = "A new masthead prints at the top of the hour. Public work on the street is already readable.";
  }
}

async function loadStreet() {
  const { data, error } = await sb
    .from("marrow_entries")
    .select("id,title,body,created_at,author_id")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(24);
  const grid = $("streetGrid");
  if (error) {
    grid.innerHTML = `<p class="empty">Could not reach the street: ${esc(error.message)}</p>`;
    return;
  }
  if (!data?.length) {
    grid.innerHTML = `<p class="empty">Nobody has marked a piece public yet. Be first.</p>`;
    return;
  }
  grid.innerHTML = data.map((row) => `
    <article class="card">
      <h3>${esc(row.title)}</h3>
      <p>${esc(snippet(row.body))}</p>
      <div class="meta">${new Date(row.created_at).toLocaleString()}</div>
    </article>
  `).join("");
}

async function ensureProfile(user) {
  const { data } = await sb.from("marrow_profiles").select("*").eq("id", user.id).maybeSingle();
  if (data) return data;
  const handle = ("m" + user.id.replace(/-/g, "").slice(0, 8)).toLowerCase();
  const row = {
    id: user.id,
    handle,
    display_name: (user.email || "someone").split("@")[0]
  };
  const { data: created, error } = await sb.from("marrow_profiles").insert(row).select().maybeSingle();
  if (error) return row;
  return created || row;
}

async function loadMine() {
  if (!session) return;
  const { data } = await sb
    .from("marrow_entries")
    .select("*")
    .eq("author_id", session.user.id)
    .order("created_at", { ascending: false });
  const box = $("mine");
  if (!data?.length) {
    box.innerHTML = `<p class="empty">Desk is empty. Write something above.</p>`;
    return;
  }
  box.innerHTML = data.map((row) => `
    <div class="slip" data-id="${row.id}">
      <strong>${esc(row.title)}</strong>
      ${row.is_public ? " · on the street" : " · private"}
      <div>
        <button data-toggle="${row.id}" data-pub="${row.is_public}">${row.is_public ? "Make private" : "Make public"}</button>
        <button data-del="${row.id}">Delete</button>
      </div>
    </div>
  `).join("");
}

function paintAuth() {
  const slot = $("authSlot");
  if (session) {
    slot.innerHTML = `
      <span class="who">${esc(profile?.display_name || session.user.email)}</span>
      <button class="ghost" id="signOut">Leave</button>
    `;
    $("signOut").onclick = () => sb.auth.signOut();
    $("deskGate").hidden = true;
    $("compose").hidden = false;
  } else {
    slot.innerHTML = `<button class="ghost" id="openAuth">Sign in</button>`;
    $("openAuth").onclick = () => $("authModal").showModal();
    $("deskGate").hidden = false;
    $("compose").hidden = true;
  }
}

$("openAuth2").onclick = () => $("authModal").showModal();

$("authForm").addEventListener("submit", async (e) => {
  if (e.submitter && e.submitter.value === "cancel") return;
  e.preventDefault();
  const email = new FormData($("authForm")).get("email");
  $("authHint").textContent = "Sending…";
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname }
  });
  $("authHint").textContent = error ? error.message : "Check your email. The door opens from the link.";
});

$("compose").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!session) return;
  const fd = new FormData($("compose"));
  const payload = {
    author_id: session.user.id,
    title: String(fd.get("title") || "").trim(),
    body: String(fd.get("body") || "").trim(),
    is_public: fd.get("is_public") === "on"
  };
  $("composeHint").textContent = "Saving…";
  const { error } = await sb.from("marrow_entries").insert(payload);
  if (error) {
    $("composeHint").textContent = error.message;
    return;
  }
  $("compose").reset();
  $("composeHint").textContent = payload.is_public ? "Saved and on the street." : "Saved privately.";
  await loadMine();
  await loadStreet();
});

$("mine").addEventListener("click", async (e) => {
  const t = e.target;
  if (t.dataset.toggle) {
    const pub = t.dataset.pub === "true";
    await sb.from("marrow_entries").update({ is_public: !pub, updated_at: new Date().toISOString() }).eq("id", t.dataset.toggle);
    await loadMine();
    await loadStreet();
  }
  if (t.dataset.del) {
    await sb.from("marrow_entries").delete().eq("id", t.dataset.del);
    await loadMine();
    await loadStreet();
  }
});

sb.auth.onAuthStateChange(async (_ev, sess) => {
  session = sess;
  profile = sess ? await ensureProfile(sess.user) : null;
  paintAuth();
  if (sess) await loadMine();
});

tickClock();
setInterval(tickClock, 1000);
loadHour();
loadStreet();
setInterval(() => { loadHour(); loadStreet(); }, 60 * 1000);
