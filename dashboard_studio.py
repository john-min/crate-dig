"""Build an interactive discovery dashboard with a built-in player + feedback.

Model: filter the library by VIBE TAGS + attributes to define a working pool,
then use SEED songs + "Find similar" to narrow within it. Thumbs up/down on the
results re-rank the search live (Rocchio relevance feedback) and are logged to
feedback.jsonl for later personalization.

    python3 player_server.py        # builds this dashboard AND plays audio
    python3 dashboard_studio.py     # build only (no sound / no feedback saving)
"""
from __future__ import annotations

import argparse
import json
from collections import Counter

import pandas as pd

from djvibe import io
from djvibe.cluster import _standardize, _umap, _suggested_moment, _pct, _reduce_for_browser


def build(workdir: str = "./djvibe_data") -> str:
    ws = io.Workspace(workdir)
    ids, emb = io.load_embeddings(ws)
    tracks = pd.read_csv(ws.tracks_csv, dtype={"track_id": str}).set_index("track_id")
    feat = (pd.read_csv(ws.features_csv, dtype={"track_id": str})
            if ws.features_csv.exists() else pd.DataFrame({"track_id": ids}))
    # optional chord progressions (from extract_chords.py; non-destructive extra pass)
    if ws.chords_csv.exists():
        chords_df = pd.read_csv(ws.chords_csv, dtype={"track_id": str}).set_index("track_id")
    else:
        chords_df = pd.DataFrame()
    reduced = _reduce_for_browser(emb, 64)

    embz = _standardize(emb)
    print("[studio] projecting (UMAP/PCA)...")
    viz, _ = _umap(embz, 2)

    df_base = pd.DataFrame({"track_id": ids})
    for col in ("title", "artist", "bpm", "key", "genre", "label"):
        df_base[col] = df_base["track_id"].map(tracks[col]) if col in tracks else ""
    fmap = feat.set_index("track_id")
    for col in ("energy_rms", "brightness", "danceability", "engagement", "est_bpm"):
        if col in fmap.columns:
            df_base[col] = df_base["track_id"].map(fmap[col])

    energy_series = df_base["energy_rms"] if "energy_rms" in df_base else df_base.get("danceability")
    val_series = df_base["engagement"] if "engagement" in df_base else df_base.get("brightness")
    moments = []
    for _, r in df_base.iterrows():
        e = _pct(energy_series, r.get("energy_rms", r.get("danceability"))) if energy_series is not None else 0.5
        v = _pct(val_series, r.get("engagement", r.get("brightness"))) if val_series is not None else 0.5
        bpm = r["bpm"] if pd.notna(r["bpm"]) else r.get("est_bpm")
        moments.append(_suggested_moment(bpm, e, v))

    vibe_cols = [c for c in feat.columns if c.startswith("vibe::")]
    vibe_names = [c.split("::", 1)[1] for c in vibe_cols]
    fv = feat.set_index("track_id")
    vc = Counter()
    per_track = {}
    for tid in ids:
        tags = []
        if vibe_cols and tid in fv.index:
            row = fv.loc[tid, vibe_cols]
            pairs = [(vibe_names[j], row.iloc[j]) for j in range(len(vibe_cols))
                     if pd.notna(row.iloc[j])]
            pairs.sort(key=lambda x: -x[1])
            tags = [p[0] for p in pairs[:5]]
        per_track[tid] = tags
        for t in tags:
            vc[t] += 1
    vibes = [{"tag": t, "count": n} for t, n in vc.most_common()]

    def _s(v):  # NaN is truthy in Python, so `v or ""` doesn't catch it — do it right
        return "" if v is None or (isinstance(v, float) and pd.isna(v)) else str(v)

    tracks_js, emb_js = [], []
    for i, tid in enumerate(ids):
        if tid not in tracks.index:          # skip stale ids no longer in rekordbox
            continue
        r = df_base.iloc[i]
        tg = per_track.get(tid, [])
        # chord progression (list of chord labels) + estimated key, if available
        ch, ch_key = [], ""
        if not chords_df.empty and tid in chords_df.index:
            cval = chords_df.at[tid, "chords"] if "chords" in chords_df.columns else ""
            if isinstance(cval, str) and cval.strip():
                ch = cval.split()
            if "key_est" in chords_df.columns:
                ch_key = _s(chords_df.at[tid, "key_est"])
        tracks_js.append({
            "id": tid, "t": _s(r.get("title")), "a": _s(r.get("artist")),
            "bpm": (float(r["bpm"]) if pd.notna(r.get("bpm")) else None),
            "key": _s(r.get("key")), "m": moments[i],
            "g": _s(r.get("genre")), "lb": _s(r.get("label")),
            "vb": tg, "tv": (tg[0] if tg else ""),
            "ch": ch, "ck": ch_key,
            "x": round(float(viz[i, 0]), 4), "y": round(float(viz[i, 1]), 4)})
        emb_js.append([round(float(x), 4) for x in reduced[i]])

    data = {"tracks": tracks_js, "emb": emb_js, "vibes": vibes,
            "backend": _backend_label(feat)}
    html = TEMPLATE.replace("/*__DATA__*/",
                            "const DATA = " + json.dumps(data, ensure_ascii=False) + ";")
    ws.dashboard_html.write_text(html, encoding="utf-8")
    mb = ws.dashboard_html.stat().st_size / 1e6
    print(f"[studio] wrote {ws.dashboard_html}  ({len(ids)} tracks, {len(vibes)} vibe tags, {mb:.1f} MB)")
    return str(ws.dashboard_html)


def _backend_label(feat):
    cols = list(feat.columns)
    if any(c.startswith(("vibe::", "clap::")) for c in cols):
        return "clap"
    if any(c.startswith("mood::") for c in cols):
        return "essentia"
    return "librosa"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workdir", default="./djvibe_data")
    build(ap.parse_args().workdir)
    print("[studio] tip: run `python3 player_server.py` to play audio + save feedback.")


TEMPLATE = r"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>djvibe · library studio</title>
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js" charset="utf-8"></script>
<style>
:root{--bg:#0d0f14;--panel:#161a23;--panel2:#1e2330;--line:#2a3040;--ink:#e8ecf4;
  --mut:#9aa6bd;--accent:#5cc8ff;--hot:#ff5c8a;--seed:#ffd166;--good:#5ce1a0;}
*{box-sizing:border-box}
body{margin:0;font:14px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--ink);}
header{padding:14px 20px;border-bottom:1px solid var(--line);display:flex;align-items:baseline;gap:14px}
header h1{font-size:18px;margin:0;letter-spacing:.3px}header .sub{color:var(--mut);font-size:12px}
.wrap{display:grid;grid-template-columns:320px 1fr;height:calc(100vh - 53px)}
.side{border-right:1px solid var(--line);padding:14px;overflow:auto;background:var(--panel);display:flex;flex-direction:column}
.side>*{flex-shrink:0}
.main{display:grid;grid-template-rows:1fr minmax(190px,44%);min-height:0}
#plot{width:100%;height:100%;min-height:0}
.listpanel{border-top:1px solid var(--line);background:var(--panel);display:flex;flex-direction:column;min-height:0}
.lphead{padding:8px 14px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;font-size:13px}
.lphead b{color:var(--accent)}
.lpbody{overflow:auto;padding:8px 12px;display:flex;flex-direction:column;gap:5px}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut);margin:14px 0 8px;display:flex;justify-content:space-between}
.card{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:6px}
input,button,select{font:inherit}
select,input[type=text]{width:100%;padding:8px 9px;border-radius:8px;border:1px solid var(--line);background:var(--panel2);color:var(--ink)}
.tagcat{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--accent);font-weight:600;margin:14px 0 7px}
.tagcat:first-child{margin-top:0}
.tags{display:flex;flex-wrap:wrap;gap:7px}
.tagchip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:20px;border:1px solid var(--line);background:var(--panel);color:var(--ink);font-size:12px;cursor:pointer;white-space:nowrap}
.tagchip .c{width:8px;height:8px;border-radius:50%;flex:0 0 auto}
.tagchip .n{color:var(--mut);font-size:10px}
.tagchip.on{border-color:var(--accent);background:#1d2a36;color:#fff}
.matchrow{display:flex;align-items:center;gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid var(--line);font-size:12px;color:var(--mut)}
.btn{width:100%;padding:9px 10px;border-radius:8px;border:1px solid var(--line);background:var(--accent);color:#04222e;font-weight:600;cursor:pointer;margin-top:8px}
.btn.ghost{background:transparent;color:var(--mut)}.btn.sm{margin-top:0;padding:5px 8px;font-size:11px;font-weight:500;width:auto}
.seedlist{margin:8px 0;display:flex;flex-direction:column;gap:6px}
.seed{display:flex;align-items:center;gap:8px;background:var(--panel2);border:1px solid var(--line);border-left:3px solid var(--seed);padding:6px 8px;border-radius:6px;font-size:13px}
.seed .lbl{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.seed b{color:var(--seed)}.seed .x{cursor:pointer;color:var(--mut)}
.row{display:flex;gap:8px;align-items:center;margin-top:6px}.row label{color:var(--mut);font-size:12px;min-width:52px}
.hit{display:flex;align-items:center;gap:6px;background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:6px 9px;font-size:13px}
.hit .hitbody{flex:1;cursor:pointer;overflow:hidden}.hit:hover{border-color:var(--accent)}
.hit .meta{color:var(--mut);font-size:11px;margin-top:2px}
.playbtn{flex:0 0 auto;width:26px;height:26px;border-radius:50%;border:1px solid var(--line);background:var(--accent);color:#04222e;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center}
.fb{flex:0 0 auto;width:26px;height:26px;border-radius:6px;border:1px solid var(--line);background:transparent;cursor:pointer;font-size:12px;opacity:.6}
.fb:hover{opacity:1}.fb.up.on{background:#153c2a;border-color:var(--good);opacity:1}.fb.dn.on{background:#3c1622;border-color:var(--hot);opacity:1}
.pill{display:inline-block;background:#2a3142;border-radius:20px;padding:1px 8px;font-size:10px;color:var(--accent)}
.sim{color:var(--hot);font-variant-numeric:tabular-nums}
.chords{margin-top:3px;display:flex;flex-wrap:wrap;gap:3px;align-items:center}
.chord{display:inline-block;background:#1d2740;border:1px solid #33406a;border-radius:4px;padding:0 5px;font-size:10px;color:#9fb4ff;font-variant-numeric:tabular-nums}
.chords .ck{color:var(--mut);font-size:10px;margin-right:2px}
.note{color:var(--mut);font-size:11px;margin-top:6px}
.player{position:sticky;bottom:-14px;background:var(--panel);padding:10px 0 2px;margin-top:auto;border-top:1px solid var(--line)}
.player .np{font-size:12px;color:var(--seed);margin:4px 0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.player audio{width:100%;height:34px}
::-webkit-scrollbar{width:9px;height:9px}::-webkit-scrollbar-thumb{background:#2a3040;border-radius:6px}
</style></head><body>
<header><h1>djvibe</h1>
<span class="sub">library studio · <span id="ntracks"></span> tracks · <span id="statline"></span> · backend: <span id="backend"></span></span></header>
<div class="wrap">
  <div class="side">
    <h2>Vibe tags <button class="btn ghost sm" id="tagclear">clear</button></h2>
    <div class="card">
      <div id="taglist"></div>
      <label class="matchrow"><input type="checkbox" id="matchall" checked/> match ALL selected tags</label>
    </div>

    <h2>Filters</h2>
    <div class="card">
      <div class="row"><label>BPM</label>
        <input id="bpmmin" type="text" placeholder="min" style="width:60px"/>
        <input id="bpmmax" type="text" placeholder="max" style="width:60px"/></div>
      <div class="row"><label>Artist</label><input id="fartist" type="text" placeholder="contains…"/></div>
      <div class="row"><label>Genre</label><select id="fgenre"></select></div>
      <div class="row"><label>Label</label><select id="flabel"></select></div>
      <button class="btn" id="applyfilter">Apply filters</button>
      <button class="btn ghost" id="clear">Reset everything</button>
    </div>

    <h2>Seed search — narrow the pool</h2>
    <input id="search" list="tracklist" placeholder="Type a title or artist, press Enter"/>
    <datalist id="tracklist"></datalist>
    <div class="seedlist" id="seeds"></div>
    <div class="row"><label>Show top</label><input id="topn" type="range" min="5" max="100" value="25" style="flex:1"/>
      <span id="topnval" style="width:34px;text-align:right">25</span></div>
    <button class="btn" id="find">Find similar within pool</button>
    <div class="note">In results: 👍 = more like this, 👎 = less. The list re-ranks live and your votes are saved.</div>

    <div class="player">
      <div class="np" id="np">▶ click any track's play button</div>
      <audio id="player" controls preload="none"></audio>
      <div class="note" id="playnote"></div>
    </div>
  </div>
  <div class="main">
    <div id="plot"></div>
    <div class="listpanel">
      <div class="lphead"><span id="listhdr">All tracks</span><span id="listcount" class="note"></span></div>
      <div class="lpbody" id="list"></div>
    </div>
  </div>
</div>
<script>
/*__DATA__*/

const T = DATA.tracks, E = DATA.emb;
const byId = {}; T.forEach((t,i)=>{t._i=i; byId[t.id]=t;});
document.getElementById('ntracks').textContent = T.length;
document.getElementById('backend').textContent = DATA.backend;

const PAL = ['#5cc8ff','#ff5c8a','#9b8cff','#5ce1a0','#ffd166','#ff924c','#4cc9f0',
 '#f15bb5','#8ac926','#ff99c8','#b5179e','#48cae4','#fb8500','#83c5be','#e0aaff',
 '#ffadad','#a0c4ff','#caffbf','#ffd6a5','#bdb2ff','#90be6d','#f9844a','#577590','#f94144'];
const tagColor={}; DATA.vibes.forEach((v,i)=>tagColor[v.tag]=PAL[i%PAL.length]);
function esc(s){return (s||'').replace(/"/g,'&quot;').replace(/</g,'&lt;');}

const CATEGORIES = [
  ["Energy / intensity", ["driving","punchy","intense","relentless","rolling","percussive","bouncy","groovy","hypnotic"]],
  ["Mood", ["euphoric","uplifting","warm","dark","melancholic","emotional","sultry","playful","dreamy"]],
  ["Texture / production", ["raw","gritty","atmospheric","spacey","dubby","lush","bright","deep","minimal","stripped-back","mellow"]],
  ["Instrumentation / elements", ["vocal","instrumental","acid","piano","arpeggiated","sub-heavy bass"]],
];

let filterMask = T.map(()=>true), seeds = [];
let selectedTags = new Set(), matchAll = true;
let fbPos = new Set(), fbNeg = new Set(), showThumbs = false;
let _ct=null,_cid=null;
let view = {type:'pool'};

// ---- player --------------------------------------------------------------
const player=document.getElementById('player'), np=document.getElementById('np'), playnote=document.getElementById('playnote');
function playTrack(id){const t=byId[id]; if(!t)return; player.src='/audio?id='+encodeURIComponent(id);
  np.textContent='♪ '+t.a+' — '+t.t; playnote.textContent=''; player.play().catch(()=>{});}
player.addEventListener('error',()=>{ playnote.innerHTML=(location.protocol==='file:')
  ? 'Audio needs the player — run <b>python3 player_server.py</b>.' : 'Could not play this file.';});

// ---- vibe tag picker (grouped) -------------------------------------------
function chipHtml(t,n){return `<span class="tagchip${selectedTags.has(t)?' on':''}" data-tag="${esc(t)}">
  <span class="c" style="background:${tagColor[t]||'#5cc8ff'}"></span>${esc(t)} <span class="n">${n}</span></span>`;}
function renderTags(){
  const el=document.getElementById('taglist');
  const cnt={}; DATA.vibes.forEach(v=>cnt[v.tag]=v.count);
  const used=new Set();
  let html='';
  CATEGORIES.forEach(([cat,tags])=>{
    const present=tags.filter(t=>t in cnt); if(!present.length) return;
    present.forEach(t=>used.add(t));
    html+=`<div class="tagcat">${esc(cat)}</div><div class="tags">${present.map(t=>chipHtml(t,cnt[t])).join('')}</div>`;
  });
  const other=DATA.vibes.filter(v=>!used.has(v.tag));
  if(other.length) html+=`<div class="tagcat">Other</div><div class="tags">${other.map(v=>chipHtml(v.tag,v.count)).join('')}</div>`;
  el.innerHTML = html || '<span class="note">No vibe tags found — run the CLAP analysis + retag.</span>';
  el.querySelectorAll('.tagchip').forEach(ch=>ch.onclick=()=>{
    const tg=ch.dataset.tag; selectedTags.has(tg)?selectedTags.delete(tg):selectedTags.add(tg);
    renderTags(); onFilterChange();});
}

// ---- filters / working pool ----------------------------------------------
function fillSelect(id, vals){
  document.getElementById(id).innerHTML='<option value="">All</option>'+
    vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
}
function buildFilterOptions(){
  const uniq=k=>[...new Set(T.map(t=>t[k]).filter(v=>v&&v.trim()))].sort((a,b)=>a.localeCompare(b));
  fillSelect('fgenre', uniq('g')); fillSelect('flabel', uniq('lb'));
}
function recomputeMask(){
  const mn=parseFloat(document.getElementById('bpmmin').value), mx=parseFloat(document.getElementById('bpmmax').value);
  const ar=document.getElementById('fartist').value.trim().toLowerCase();
  const gv=document.getElementById('fgenre').value, lv=document.getElementById('flabel').value;
  const tags=[...selectedTags];
  filterMask=T.map(t=>{
    if(!isNaN(mn)&&(!t.bpm||t.bpm<mn))return false;
    if(!isNaN(mx)&&(!t.bpm||t.bpm>mx))return false;
    if(ar && !(t.a||'').toLowerCase().includes(ar))return false;
    if(gv && t.g!==gv)return false;
    if(lv && t.lb!==lv)return false;
    if(tags.length){ const has=tags.filter(tg=>t.vb.includes(tg)).length;
      if(matchAll ? has!==tags.length : has===0) return false; }
    return true;});
}
function poolCount(){ let n=0; for(let i=0;i<T.length;i++) if(filterMask[i]) n++; return n; }
function onFilterChange(){
  recomputeMask(); draw();
  if(view.type==='similar' && seeds.length) findSimilar(); else showPool();
}

// ---- song list under the map ---------------------------------------------
function rowHtml(i, score){const t=T[i];
  const bits=[t.bpm?Math.round(t.bpm)+' BPM':'', t.key, t.g, t.lb].filter(Boolean).map(esc).join(' · ');
  const sim=score!=null?` <span class="sim">${(score*100).toFixed(0)}%</span>`:'';
  const fb=showThumbs?`<button class="fb up${fbPos.has(t.id)?' on':''}" data-fb="up" data-id="${t.id}">👍</button><button class="fb dn${fbNeg.has(t.id)?' on':''}" data-fb="dn" data-id="${t.id}">👎</button>`:'';
  const chords=(t.ch&&t.ch.length)
    ? `<div class="chords">${t.ck?`<span class="ck">${esc(t.ck)}:</span>`:''}`
      + t.ch.map(c=>`<span class="chord">${esc(c)}</span>`).join('') + `</div>`
    : '';
  return `<div class="hit"><button class="playbtn" data-play="${t.id}">▶</button>
    <div class="hitbody" data-id="${t.id}"><div><b>${esc(t.a)}</b> — ${esc(t.t)}</div>
    <div class="meta">${bits} · <span class="pill">${esc(t.m)}</span>${sim}</div>${chords}</div>${fb}</div>`;}
function renderList(items, header){
  document.getElementById('listhdr').innerHTML=header;
  const cap=1200, shown=items.slice(0,cap);
  document.getElementById('listcount').textContent=items.length>cap?`showing ${cap} of ${items.length}`:`${items.length} tracks`;
  document.getElementById('list').innerHTML=shown.map(it=>rowHtml(it.i, it.s)).join('');
  document.querySelectorAll('#list .hitbody').forEach(h=>h.onclick=()=>addSeed(h.dataset.id));
  document.querySelectorAll('#list .playbtn').forEach(b=>b.onclick=()=>playTrack(b.dataset.play));
  document.querySelectorAll('#list .fb').forEach(b=>b.onclick=()=>onFb(b.dataset.id, b.dataset.fb));
}
function poolLabel(){
  const parts=[...selectedTags];
  return parts.length ? `<b>${esc(parts.join(' + '))}</b>` : 'All tracks';
}
function showPool(){
  view={type:'pool'}; showThumbs=false;
  const items=[]; for(let i=0;i<T.length;i++) if(filterMask[i]) items.push({i});
  items.sort((a,b)=>(T[a.i].bpm||0)-(T[b.i].bpm||0));
  renderList(items, poolLabel());
  highlight([]);
}

// ---- seed search + feedback ----------------------------------------------
const dl=document.getElementById('tracklist');
dl.innerHTML=T.slice(0,4000).map(t=>`<option value="${esc(t.a)} — ${esc(t.t)}">`).join('');
document.getElementById('search').addEventListener('keydown',e=>{
  if(e.key!=='Enter')return; const v=e.target.value.trim().toLowerCase();
  const hit=T.find(t=>(`${t.a} — ${t.t}`).toLowerCase()===v)||T.find(t=>(`${t.a} ${t.t}`).toLowerCase().includes(v));
  if(hit){addSeed(hit.id); e.target.value='';}});
function addSeed(id){ if(!seeds.includes(id)){ seeds.push(id); fbPos.clear(); fbNeg.clear(); renderSeeds(); draw(); } }
function renderSeeds(){
  const el=document.getElementById('seeds');
  el.innerHTML=seeds.map(id=>{const t=byId[id];
    return `<div class="seed"><button class="playbtn" data-play="${id}">▶</button>
      <span class="lbl"><b>${esc(t.a)}</b> — ${esc(t.t)}</span><span class="x" data-id="${id}">✕</span></div>`;}).join('');
  el.querySelectorAll('.x').forEach(x=>x.onclick=()=>{seeds=seeds.filter(s=>s!==x.dataset.id);fbPos.clear();fbNeg.clear();renderSeeds();draw();});
  el.querySelectorAll('.playbtn').forEach(b=>b.onclick=()=>playTrack(b.dataset.play));
}
function computeQuery(){
  const dim=E[0].length, q=new Float64Array(dim);
  const acc=(set,w)=>{ if(!set.size)return; const m=new Float64Array(dim);
    set.forEach(id=>{const v=E[byId[id]._i]; for(let k=0;k<dim;k++)m[k]+=v[k];});
    for(let k=0;k<dim;k++) q[k]+=w*m[k]/set.size; };
  acc(new Set(seeds),1.0); acc(fbPos,0.8); acc(fbNeg,-0.4);
  let n=0;for(let k=0;k<dim;k++)n+=q[k]*q[k];n=Math.sqrt(n)||1;for(let k=0;k<dim;k++)q[k]/=n;
  return q;
}
function findSimilar(){
  if(!seeds.length){ alert('Add a seed first — click a dot on the map, or search a track.'); return; }
  const q=computeQuery();
  const ss=new Set(seeds),scored=[];
  for(let i=0;i<T.length;i++){ if(!filterMask[i]||ss.has(T[i].id))continue;
    const v=E[i];let d=0;for(let k=0;k<q.length;k++)d+=q[k]*v[k];scored.push([d,i]); }
  scored.sort((a,b)=>b[0]-a[0]);
  scored.length=Math.min(scored.length,+document.getElementById('topn').value);
  view={type:'similar'}; showThumbs=true;
  const nfb=fbPos.size+fbNeg.size;
  renderList(scored.map(([s,i])=>({i,s})),
    `<b>Closest to your ${seeds.length} seed${seeds.length>1?'s':''}</b> in ${poolCount()}-track pool${nfb?` · tuned by ${nfb} 👍/👎`:''}`);
  highlight(scored.map(s=>s[1]));
}
function onFb(id, dir){
  if(dir==='up'){ fbNeg.delete(id); fbPos.has(id)?fbPos.delete(id):fbPos.add(id); }
  else { fbPos.delete(id); fbNeg.has(id)?fbNeg.delete(id):fbNeg.add(id); }
  logFeedback(id, fbPos.has(id)?'up':(fbNeg.has(id)?'down':'clear'));
  findSimilar();
}
function logFeedback(track, vote){
  try{ fetch('/feedback',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ts:Date.now(), seeds:[...seeds], track, vote})}); }catch(e){}
}

// ---- plot ----------------------------------------------------------------
function hover(i){const t=T[i]; return `<b>${esc(t.a)}</b> — ${esc(t.t)}<br>${t.bpm?Math.round(t.bpm)+' BPM ':''}${t.key||''}<br>${esc(t.vb.slice(0,3).join(' / '))}<br><i>${esc(t.m)}</i>`;}
function draw(){
  const inSet=[], outSet=[];
  for(let i=0;i<T.length;i++)(filterMask[i]?inSet:outSet).push(i);
  const traces=[];
  if(outSet.length) traces.push({type:'scattergl',mode:'markers',showlegend:false,hoverinfo:'skip',
    x:outSet.map(i=>T[i].x),y:outSet.map(i=>T[i].y),customdata:outSet.map(i=>T[i].id),
    marker:{size:5,color:'#39404f',opacity:.22}});
  if(inSet.length) traces.push({type:'scattergl',mode:'markers',showlegend:false,
    x:inSet.map(i=>T[i].x),y:inSet.map(i=>T[i].y),customdata:inSet.map(i=>T[i].id),
    text:inSet.map(i=>hover(i)),hovertemplate:'%{text}<extra></extra>',
    marker:{size:6,opacity:.85,color:inSet.map(i=>tagColor[T[i].tv]||'#5cc8ff')}});
  Plotly.react('plot',traces,layout(),{responsive:true,displaylogo:false}); attachClick();
}
function layout(){return {paper_bgcolor:'#0d0f14',plot_bgcolor:'#0d0f14',font:{color:'#9aa6bd'},
  margin:{l:10,r:10,t:10,b:10},xaxis:{visible:false},yaxis:{visible:false},showlegend:false,
  hoverlabel:{bgcolor:'#1e2330',bordercolor:'#2a3040',font:{color:'#e8ecf4'}}};}
function highlight(idxs){ draw();
  if(idxs && idxs.length){Plotly.addTraces('plot',[{type:'scattergl',mode:'markers',showlegend:false,
    x:idxs.map(i=>T[i].x),y:idxs.map(i=>T[i].y),customdata:idxs.map(i=>T[i].id),
    text:idxs.map(i=>hover(i)),hovertemplate:'%{text}<extra></extra>',
    marker:{size:10,color:'#ff5c8a',line:{width:1,color:'#fff'},opacity:.95}}]);}
  if(seeds.length){Plotly.addTraces('plot',[{type:'scattergl',mode:'markers',showlegend:false,
    x:seeds.map(id=>byId[id].x),y:seeds.map(id=>byId[id].y),
    text:seeds.map(id=>`SEED: ${esc(byId[id].a)} — ${esc(byId[id].t)}`),hovertemplate:'%{text}<extra></extra>',
    marker:{size:15,color:'#ffd166',symbol:'star',line:{width:1.5,color:'#fff'}}}]);}
  attachClick();}
function attachClick(){const gd=document.getElementById('plot');
  if(gd.removeAllListeners)gd.removeAllListeners('plotly_click');
  gd.on('plotly_click',ev=>{
    const id=ev.points[0].customdata; if(!id)return;
    if(_ct&&_cid===id){clearTimeout(_ct);_ct=null;_cid=null;playTrack(id);}
    else{_cid=id;_ct=setTimeout(()=>{addSeed(id);_ct=null;_cid=null;},280);}});}

// ---- controls ------------------------------------------------------------
document.getElementById('matchall').onchange=e=>{matchAll=e.target.checked; onFilterChange();};
document.getElementById('tagclear').onclick=()=>{selectedTags.clear(); renderTags(); onFilterChange();};
document.getElementById('applyfilter').onclick=onFilterChange;
document.getElementById('topn').oninput=e=>document.getElementById('topnval').textContent=e.target.value;
document.getElementById('find').onclick=findSimilar;
document.getElementById('clear').onclick=()=>{seeds=[];fbPos.clear();fbNeg.clear();renderSeeds();selectedTags.clear();renderTags();
  ['bpmmin','bpmmax','fartist'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('fgenre').value=''; document.getElementById('flabel').value='';
  document.getElementById('statline').textContent='';
  recomputeMask(); draw(); showPool();};

buildFilterOptions(); renderTags(); recomputeMask(); draw(); showPool();
</script></body></html>
"""

if __name__ == "__main__":
    main()
