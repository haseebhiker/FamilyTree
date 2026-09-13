import type { Person, Spouse } from "@/lib/types";

export interface OfflinePerson {
  id: string;
  full_name: string;
  preferred_name: string | null;
  other_names: string | null;
  surname_tag: string | null;
  living_status: string;
  date_of_birth: string | null;
  date_of_death: string | null;
  place_of_birth: string | null;
  place_of_death: string | null;
  bio: string | null;
  father_id: string | null;
  mother_id: string | null;
}

export interface OfflineSpouse {
  a: string;
  b: string;
  marriage_notes: string | null;
}

/**
 * Builds a single self-contained HTML file (data + a small vanilla-JS tree
 * browser inline, no external files or network calls) so it still works
 * once unzipped and opened directly from disk with no server running.
 * Callers must pass already privacy-redacted data — this only shapes and
 * embeds it, it doesn't apply any redaction of its own.
 */
export function generateOfflineTreeHtml(people: OfflinePerson[], spouses: OfflineSpouse[], generatedAt: string): string {
  const dataJson = JSON.stringify(people).replace(/</g, "\\u003c");
  const spousesJson = JSON.stringify(spouses).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Nambadavangal Family Tree (Offline Snapshot)</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; background: #f8fafc; color: #0f172a; }
  header { background: #fff; border-bottom: 1px solid #e2e8f0; padding: 12px 16px; position: sticky; top: 0; z-index: 5; }
  header h1 { font-size: 16px; margin: 0 0 2px; }
  header p { font-size: 12px; color: #64748b; margin: 0; }
  #search { width: 100%; max-width: 480px; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; margin-top: 8px; }
  main { max-width: 900px; margin: 0 auto; padding: 16px; }
  ul.tree { list-style: none; margin: 0; padding-left: 0; }
  ul.tree ul { list-style: none; margin: 0; padding-left: 18px; border-left: 1px solid #e2e8f0; }
  .node { display: flex; align-items: center; gap: 4px; padding: 3px 0; }
  .toggle { width: 18px; height: 18px; border: none; background: none; cursor: pointer; color: #94a3b8; font-size: 12px; flex-shrink: 0; }
  .toggle:disabled { visibility: hidden; }
  .name-btn { background: none; border: none; padding: 0; font-size: 14px; color: #0f172a; cursor: pointer; text-align: left; }
  .name-btn:hover { text-decoration: underline; }
  .deceased .name-btn { color: #64748b; }
  #search-results { position: absolute; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,.08); max-height: 300px; overflow-y: auto; width: 100%; max-width: 480px; z-index: 10; }
  #search-results div { padding: 6px 10px; font-size: 13px; cursor: pointer; }
  #search-results div:hover { background: #f1f5f9; }
  #search-wrap { position: relative; max-width: 480px; }
  dialog { border: none; border-radius: 10px; padding: 0; max-width: 480px; width: 90%; box-shadow: 0 10px 40px rgba(0,0,0,.2); }
  dialog::backdrop { background: rgba(15,23,42,.4); }
  .dialog-body { padding: 20px; }
  .dialog-body h2 { margin: 0 0 4px; font-size: 18px; }
  .dialog-body .meta { font-size: 13px; color: #64748b; margin-bottom: 10px; }
  .dialog-body dl { font-size: 13px; margin: 10px 0; }
  .dialog-body dt { font-weight: 600; color: #475569; margin-top: 6px; }
  .dialog-close { position: absolute; top: 10px; right: 12px; border: none; background: none; font-size: 18px; cursor: pointer; color: #94a3b8; }
</style>
</head>
<body>
<header>
  <h1>Nambadavangal Family Tree — Offline Snapshot</h1>
  <p>Generated ${generatedAt}. Read-only. Contact details and admin-only fields are not included in this export.</p>
  <div id="search-wrap">
    <input id="search" type="text" placeholder="Search for a person by name…" autocomplete="off">
    <div id="search-results" hidden></div>
  </div>
</header>
<main><ul class="tree" id="tree"></ul></main>
<dialog id="detail">
  <div class="dialog-body">
    <button class="dialog-close" onclick="document.getElementById('detail').close()">✕</button>
    <div id="detail-content"></div>
  </div>
</dialog>
<script>
const PEOPLE = ${dataJson};
const SPOUSES = ${spousesJson};

const byId = new Map(PEOPLE.map(p => [p.id, p]));
const childrenByParent = new Map();
for (const p of PEOPLE) {
  for (const parentId of [p.father_id, p.mother_id]) {
    if (!parentId) continue;
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    const list = childrenByParent.get(parentId);
    if (!list.includes(p.id)) list.push(p.id);
  }
}
for (const list of childrenByParent.values()) {
  list.sort((a, b) => byId.get(a).full_name.localeCompare(byId.get(b).full_name));
}

function displayName(p) {
  return p.surname_tag ? p.full_name + " /" + p.surname_tag + "/" : p.full_name;
}

const roots = PEOPLE.filter(p => !p.father_id && !p.mother_id).sort((a, b) => a.full_name.localeCompare(b.full_name));

function buildNode(personId, depth) {
  const p = byId.get(personId);
  const li = document.createElement("li");
  const row = document.createElement("div");
  row.className = "node" + (p.living_status === "deceased" ? " deceased" : "");

  const kids = childrenByParent.get(personId) || [];
  const toggle = document.createElement("button");
  toggle.className = "toggle";
  toggle.textContent = kids.length ? "▸" : "";
  toggle.disabled = kids.length === 0;
  row.appendChild(toggle);

  const nameBtn = document.createElement("button");
  nameBtn.className = "name-btn";
  nameBtn.textContent = displayName(p);
  nameBtn.onclick = () => showDetail(personId);
  row.appendChild(nameBtn);

  li.appendChild(row);

  if (kids.length) {
    const childUl = document.createElement("ul");
    childUl.hidden = depth >= 1;
    toggle.textContent = childUl.hidden ? "▸" : "▾";
    toggle.onclick = () => {
      childUl.hidden = !childUl.hidden;
      toggle.textContent = childUl.hidden ? "▸" : "▾";
      if (!childUl.hidden && !childUl.dataset.built) {
        kids.forEach(cid => childUl.appendChild(buildNode(cid, depth + 1)));
        childUl.dataset.built = "1";
      }
    };
    if (!childUl.hidden) {
      kids.forEach(cid => childUl.appendChild(buildNode(cid, depth + 1)));
      childUl.dataset.built = "1";
    }
    li.appendChild(childUl);
  }

  return li;
}

const treeEl = document.getElementById("tree");
roots.forEach(r => treeEl.appendChild(buildNode(r.id, 0)));

function showDetail(personId) {
  const p = byId.get(personId);
  const father = p.father_id ? byId.get(p.father_id) : null;
  const mother = p.mother_id ? byId.get(p.mother_id) : null;
  const marriages = SPOUSES.filter(s => s.a === personId || s.b === personId)
    .map(s => byId.get(s.a === personId ? s.b : s.a))
    .filter(Boolean);
  const kids = (childrenByParent.get(personId) || []).map(id => byId.get(id));

  let html = '<h2>' + displayName(p) + '</h2>';
  html += '<div class="meta">' + p.living_status;
  if (p.date_of_birth || p.date_of_death) {
    html += ' · ' + (p.date_of_birth || '?') + ' – ' + (p.living_status === 'living' ? 'present' : (p.date_of_death || '?'));
  }
  html += '</div>';
  if (p.preferred_name) html += '<p>Goes by ' + p.preferred_name + '</p>';
  if (p.other_names) html += '<p>Also known as ' + p.other_names + '</p>';
  html += '<dl>';
  if (father) html += '<dt>Father</dt><dd><button class="name-btn" onclick="showDetail(\\'' + father.id + '\\')">' + displayName(father) + '</button></dd>';
  if (mother) html += '<dt>Mother</dt><dd><button class="name-btn" onclick="showDetail(\\'' + mother.id + '\\')">' + displayName(mother) + '</button></dd>';
  if (marriages.length) {
    html += '<dt>Spouse(s)</dt><dd>' + marriages.map(m => '<button class="name-btn" onclick="showDetail(\\'' + m.id + '\\')">' + displayName(m) + '</button>').join(', ') + '</dd>';
  }
  if (kids.length) {
    html += '<dt>Children</dt><dd>' + kids.map(c => '<button class="name-btn" onclick="showDetail(\\'' + c.id + '\\')">' + displayName(c) + '</button>').join(', ') + '</dd>';
  }
  if (p.place_of_birth) html += '<dt>Place of birth</dt><dd>' + p.place_of_birth + '</dd>';
  if (p.place_of_death) html += '<dt>Place of death</dt><dd>' + p.place_of_death + '</dd>';
  if (p.bio) html += '<dt>Notes</dt><dd>' + p.bio + '</dd>';
  html += '</dl>';

  document.getElementById('detail-content').innerHTML = html;
  document.getElementById('detail').showModal();
}

const searchInput = document.getElementById('search');
const resultsEl = document.getElementById('search-results');
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  if (q.length < 2) { resultsEl.hidden = true; return; }
  const matches = PEOPLE.filter(p => displayName(p).toLowerCase().includes(q)).slice(0, 15);
  resultsEl.innerHTML = '';
  matches.forEach(p => {
    const div = document.createElement('div');
    div.textContent = displayName(p);
    div.onclick = () => { showDetail(p.id); resultsEl.hidden = true; searchInput.value = ''; };
    resultsEl.appendChild(div);
  });
  resultsEl.hidden = matches.length === 0;
});
</script>
</body>
</html>
`;
}

export function toOfflinePerson(p: Person): OfflinePerson {
  return {
    id: p.id,
    full_name: p.full_name,
    preferred_name: p.preferred_name,
    other_names: p.other_names,
    surname_tag: p.surname_tag,
    living_status: p.living_status,
    date_of_birth: p.date_of_birth,
    date_of_death: p.date_of_death,
    place_of_birth: p.place_of_birth,
    place_of_death: p.place_of_death,
    bio: p.bio,
    father_id: p.father_id,
    mother_id: p.mother_id,
  };
}

export function toOfflineSpouse(s: Spouse): OfflineSpouse {
  return { a: s.person_a_id, b: s.person_b_id, marriage_notes: s.marriage_notes };
}
