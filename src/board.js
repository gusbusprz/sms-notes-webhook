/**
 * The board UI, served at GET /.
 *
 * Brand values are taken from harmonytechgroup.com: near-black surfaces,
 * near-white text, a violet accent, Geist for UI and Source Serif 4 for
 * display text.
 *
 * The page JS deliberately avoids template literals (this whole file is one)
 * and builds the DOM with createElement + textContent, so note text coming
 * from SMS can never be interpreted as markup.
 */
export const BOARD_HTML = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#09090B">
<title>Notes | Harmony Tech Group</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#09090B; --surface:#18181B; --surface-2:#1F1F23; --line:#2A2A31;
  --text:#FAFAFA; --muted:#D3D4D8; --dim:#9E9FA9;
  --accent:#B57EFF; --accent-soft:#D2B4FF; --danger:#F23131;
  --sans:"Geist",system-ui,-apple-system,"Segoe UI",sans-serif;
  --serif:"Source Serif 4",Georgia,"Times New Roman",serif;
  --r:12px;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  background:var(--bg); color:var(--text); font-family:var(--sans);
  font-size:15px; line-height:1.5; -webkit-font-smoothing:antialiased;
  min-height:100dvh;
}
.wrap{max-width:1120px;margin:0 auto;padding:0 16px;padding-block:24px}

header{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:4px}
.mark{font-family:var(--serif);font-size:26px;font-weight:600;letter-spacing:-.01em}
.mark em{font-style:normal;color:var(--accent)}
.sub{color:var(--dim);font-size:13px}
.tagline{color:var(--dim);font-size:13px;margin:0 0 22px;font-family:var(--serif);font-style:italic}

/* column tabs: the only nav on narrow screens */
.tabs{display:flex;gap:6px;margin-bottom:18px;overflow-x:auto;-webkit-overflow-scrolling:touch}
.tab{
  flex:0 0 auto;background:var(--surface);border:1px solid var(--line);color:var(--muted);
  font:inherit;font-size:13px;font-weight:500;padding:8px 14px;border-radius:999px;cursor:pointer;
  display:flex;align-items:center;gap:7px;transition:border-color .15s,color .15s,background .15s;
}
.tab:hover{border-color:var(--accent);color:var(--text)}
.tab[aria-selected="true"]{background:var(--accent);border-color:var(--accent);color:#1A0B2E;font-weight:600}
.tab .n{
  font-variant-numeric:tabular-nums;font-size:11px;background:rgba(255,255,255,.09);
  padding:1px 7px;border-radius:999px;
}
.tab[aria-selected="true"] .n{background:rgba(26,11,46,.18)}

.board{display:grid;gap:18px}
@media(min-width:860px){
  .board{grid-template-columns:repeat(3,1fr);align-items:start}
  .tabs{display:none}
  .col{display:block !important}
}
.col h2{
  font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
  color:var(--dim);margin:0 0 10px;display:flex;align-items:center;gap:8px;
}
.col h2 .n{font-variant-numeric:tabular-nums;color:var(--dim);font-weight:400}
@media(max-width:859px){ .col{display:none} .col h2{display:none} }

.cards{display:flex;flex-direction:column;gap:10px;min-height:8px}

.card{
  background:var(--surface);border:1px solid var(--line);border-radius:var(--r);
  padding:13px 14px;transition:border-color .15s;
}
.card:hover{border-color:#3A3A44}
.card.done .msg{color:var(--dim)}
.msg{
  margin:0 0 10px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:15px;line-height:1.45;cursor:text;
}
.msg:focus{outline:2px solid var(--accent);outline-offset:3px;border-radius:4px}
.meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11.5px;color:var(--dim)}
.meta .dot{opacity:.45}
.row{display:flex;gap:6px;margin-top:11px;flex-wrap:wrap}
.btn{
  background:var(--surface-2);border:1px solid var(--line);color:var(--muted);
  font:inherit;font-size:12px;font-weight:500;padding:6px 11px;border-radius:8px;cursor:pointer;
  transition:border-color .15s,color .15s;min-height:32px;
}
.btn:hover{border-color:var(--accent);color:var(--text)}
.btn.primary{border-color:rgba(181,126,255,.4);color:var(--accent-soft)}
.btn:disabled{opacity:.4;cursor:default}
.btn:disabled:hover{border-color:var(--line);color:var(--muted)}

.empty{
  border:1px dashed var(--line);border-radius:var(--r);padding:18px 14px;
  color:var(--dim);font-size:13px;text-align:center;
}

/* gate */
.gate{max-width:340px;margin:14vh auto 0;text-align:center}
.gate .mark{display:block;margin-bottom:6px}
.gate p{color:var(--dim);font-size:13.5px;margin:0 0 20px}
.gate form{display:flex;gap:8px}
.gate input{
  flex:1;background:var(--surface);border:1px solid var(--line);color:var(--text);
  font:inherit;padding:10px 13px;border-radius:10px;min-width:0;
}
.gate input:focus{outline:none;border-color:var(--accent)}
.gate .btn{padding:10px 16px}
.err{color:var(--danger);font-size:13px;margin-top:14px;min-height:18px}

.status{
  position:fixed;left:50%;transform:translateX(-50%);bottom:20px;
  background:var(--surface-2);border:1px solid var(--line);color:var(--muted);
  padding:9px 16px;border-radius:999px;font-size:13px;
  opacity:0;pointer-events:none;transition:opacity .2s;max-width:calc(100vw - 32px);
}
.status.show{opacity:1}
.status.bad{border-color:var(--danger);color:#FFB4B4}
footer{margin-top:34px;color:var(--dim);font-size:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
</style>
</head>
<body>
<div class="wrap">
  <div id="app"></div>
</div>
<div class="status" id="toast" role="status" aria-live="polite"></div>

<script>
(function(){
  "use strict";
  var COLUMNS = ["To Do","In Progress","Done"];
  var app = document.getElementById("app");
  var toastEl = document.getElementById("toast");
  var notes = [];
  var active = "To Do";
  var toastTimer;

  function toast(msg, bad){
    toastEl.textContent = msg;
    toastEl.className = "status show" + (bad ? " bad" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toastEl.className = "status"; }, 2600);
  }

  function el(tag, cls, text){
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function when(iso){
    if (!iso) return "";
    var d = new Date(iso), now = new Date();
    var mins = Math.round((now - d) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    var sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString(undefined, sameYear
      ? { month:"short", day:"numeric" }
      : { month:"short", day:"numeric", year:"numeric" });
  }

  function tail(num){
    if (!num) return "";
    var digits = String(num).replace(/\\D/g,"");
    return digits ? "..." + digits.slice(-4) : "";
  }

  // ---------- access gate ----------
  function renderGate(message){
    app.innerHTML = "";
    var g = el("div","gate");
    var m = el("div","mark"); m.appendChild(document.createTextNode("Harmony "));
    var em = el("em",null,"Notes"); m.appendChild(em);
    g.appendChild(m);
    g.appendChild(el("p",null,"Enter your access code to open the board."));
    var form = el("form");
    var input = document.createElement("input");
    input.type = "password"; input.placeholder = "Access code";
    input.autocomplete = "current-password"; input.setAttribute("aria-label","Access code");
    var go = el("button","btn primary","Open"); go.type = "submit";
    form.appendChild(input); form.appendChild(go);
    var err = el("div","err", message || "");
    g.appendChild(form); g.appendChild(err);
    app.appendChild(g);
    input.focus();

    form.addEventListener("submit", function(e){
      e.preventDefault();
      go.disabled = true; err.textContent = "";
      fetch("/api/auth", {
        method:"POST",
        headers:{ "content-type":"application/json" },
        body: JSON.stringify({ code: input.value })
      }).then(function(r){
        if (r.ok) { load(); return; }
        go.disabled = false;
        err.textContent = r.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : "That code was not recognised.";
        input.select();
      }).catch(function(){
        go.disabled = false;
        err.textContent = "Could not reach the server.";
      });
    });
  }

  // ---------- board ----------
  function renderBoard(){
    app.innerHTML = "";

    var head = el("header");
    var m = el("div","mark");
    m.appendChild(document.createTextNode("Harmony "));
    m.appendChild(el("em",null,"Notes"));
    head.appendChild(m);
    head.appendChild(el("span","sub", notes.length + (notes.length === 1 ? " note" : " notes")));
    app.appendChild(head);
    app.appendChild(el("p","tagline","Text it, and it is here."));

    var counts = {};
    COLUMNS.forEach(function(c){ counts[c] = notes.filter(function(n){ return n.status === c; }).length; });

    var tabs = el("div","tabs"); tabs.setAttribute("role","tablist");
    COLUMNS.forEach(function(c){
      var t = el("button","tab");
      t.type = "button"; t.setAttribute("role","tab");
      t.setAttribute("aria-selected", String(c === active));
      t.appendChild(document.createTextNode(c));
      t.appendChild(el("span","n", String(counts[c])));
      t.addEventListener("click", function(){ active = c; renderBoard(); });
      tabs.appendChild(t);
    });
    app.appendChild(tabs);

    var board = el("div","board");
    COLUMNS.forEach(function(c){
      var col = el("section","col");
      if (c === active) col.style.display = "block";
      var h = el("h2"); h.appendChild(document.createTextNode(c));
      h.appendChild(el("span","n", String(counts[c])));
      col.appendChild(h);
      var list = el("div","cards");
      var inCol = notes.filter(function(n){ return n.status === c; });
      if (!inCol.length){
        list.appendChild(el("div","empty", c === "To Do" ? "Nothing waiting. Text the number to add one." : "Nothing here."));
      } else {
        inCol.forEach(function(n){ list.appendChild(cardFor(n)); });
      }
      col.appendChild(list);
      board.appendChild(col);
    });
    app.appendChild(board);

    var f = el("footer");
    var refresh = el("button","btn","Refresh");
    refresh.type = "button";
    refresh.addEventListener("click", function(){ load(true); });
    f.appendChild(refresh);
    f.appendChild(el("span",null,"Harmony Tech Group"));
    app.appendChild(f);
  }

  function cardFor(n){
    var card = el("div","card" + (n.status === "Done" ? " done" : ""));

    var msg = el("p","msg", n.message);
    msg.contentEditable = "plaintext-only";
    msg.spellcheck = false;
    msg.setAttribute("aria-label","Note text, editable");
    var before = n.message;
    msg.addEventListener("focus", function(){ before = msg.textContent; });
    msg.addEventListener("blur", function(){
      var next = msg.textContent.trim();
      if (next === before.trim()) return;
      if (!next){ msg.textContent = before; toast("A note cannot be empty.", true); return; }
      patch(n.id, { Message: next }, function(ok){
        if (ok){ n.message = next; toast("Saved."); }
        else { msg.textContent = before; }
      });
    });
    msg.addEventListener("keydown", function(e){
      if (e.key === "Enter" && !e.shiftKey){ e.preventDefault(); msg.blur(); }
      if (e.key === "Escape"){ msg.textContent = before; msg.blur(); }
    });
    card.appendChild(msg);

    var meta = el("div","meta");
    meta.appendChild(el("span",null, when(n.receivedAt)));
    var t = tail(n.from);
    if (t){ meta.appendChild(el("span","dot","/")); meta.appendChild(el("span",null,t)); }
    card.appendChild(meta);

    var row = el("div","row");
    var idx = COLUMNS.indexOf(n.status);
    if (idx > 0) row.appendChild(moveBtn(n, COLUMNS[idx-1], "\\u2190 " + COLUMNS[idx-1], false));
    if (idx < COLUMNS.length - 1) row.appendChild(moveBtn(n, COLUMNS[idx+1], COLUMNS[idx+1] + " \\u2192", true));
    card.appendChild(row);

    return card;
  }

  function moveBtn(n, target, label, primary){
    var b = el("button","btn" + (primary ? " primary" : ""), label);
    b.type = "button";
    b.addEventListener("click", function(){
      b.disabled = true;
      patch(n.id, { Status: target }, function(ok){
        if (ok){ n.status = target; active = target; renderBoard(); toast("Moved to " + target + "."); }
        else { b.disabled = false; }
      });
    });
    return b;
  }

  // ---------- data ----------
  function patch(id, fields, done){
    fetch("/api/notes/" + encodeURIComponent(id), {
      method:"PATCH",
      headers:{ "content-type":"application/json" },
      body: JSON.stringify(fields)
    }).then(function(r){
      if (r.status === 401){ renderGate("Your session expired. Enter the code again."); return; }
      if (!r.ok){ toast("Could not save that change.", true); done(false); return; }
      done(true);
    }).catch(function(){ toast("Network problem. Change not saved.", true); done(false); });
  }

  function load(announce){
    fetch("/api/notes", { headers:{ "accept":"application/json" } })
      .then(function(r){
        if (r.status === 401){ renderGate(""); return null; }
        if (!r.ok) throw new Error("load failed");
        return r.json();
      })
      .then(function(data){
        if (!data) return;
        notes = data.notes || [];
        renderBoard();
        if (announce) toast("Up to date.");
      })
      .catch(function(){
        app.innerHTML = "";
        app.appendChild(el("div","empty","Could not load notes. Check the Worker logs."));
      });
  }

  load();
})();
</script>
</body>
</html>`;
