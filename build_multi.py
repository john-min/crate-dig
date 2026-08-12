"""Multi-engine dashboard: toggle between analysis types AND a combined view.

Auto-detects whichever result sets you have and builds ONE dashboard with a
source dropdown:
    djvibe_data              -> labeled by its features (essentia / librosa / clap)
    djvibe_clap              -> clap
    djvibe_data/_librosa_backup -> librosa
    + "combined"             -> all of the above fused into one representation

"Combined" standardizes each engine's embedding, weights them equally, and
concatenates them, so similarity + clusters reflect every engine at once.

    python3 build_multi.py            # build + open the multi-engine dashboard
    python3 build_multi.py --no-serve # just build djvibe_data/dashboard.html

Switching engines in the page swaps the map, clusters, and similarity together.
Audio playback uses djvibe_data/tracks.csv via player_server.
"""
from __future__ import annotations

import argparse
import json
import os

import numpy as np
import pandas as pd

from djvibe import io
from djvibe.cluster import (_standardize, _umap, _name_clusters,
                            _suggested_moment, _pct, _reduce_for_browser)
from dashboard_studio import GRAN, _hdbscan, _absorb, _preset, _backend_label

CANDIDATES = [  # (subdir, fallback_label, needs_external_tracks_csv)
    ("djvibe_data", None, False),
    ("djvibe_clap", "clap", False),
    ("djvibe_data/_librosa_backup", "librosa", True),
]


# --------------------------------------------------------------------------
def compute_view(ids, emb, tracks, feat, label):
    """Build one engine's view: 2D map, cluster presets, similarity embedding."""
    embz = _standardize(emb)
    viz, _ = _umap(embz, 2)
    clu_space, _ = _umap(embz, min(10, embz.shape[1]))

    df = pd.DataFrame({"track_id": ids})
    for col in ("title", "artist", "bpm", "key", "genre"):
        df[col] = df["track_id"].map(tracks[col]) if col in tracks else ""
    fmap = feat.set_index("track_id")
    for col in ("energy_rms", "brightness", "danceability", "mood_top",
                "genre_pred", "engagement", "est_bpm"):
        if col in fmap.columns:
            df[col] = df["track_id"].map(fmap[col])

    energy = df["energy_rms"] if "energy_rms" in df else df.get("danceability")
    val = df["engagement"] if "engagement" in df else df.get("brightness")
    moments = []
    for _, r in df.iterrows():
        e = _pct(energy, r.get("energy_rms", r.get("danceability"))) if energy is not None else 0.5
        v = _pct(val, r.get("engagement", r.get("brightness"))) if val is not None else 0.5
        bpm = r["bpm"] if pd.notna(r.get("bpm")) else r.get("est_bpm")
        moments.append(_suggested_moment(bpm, e, v))

    presets = {}
    for gi, mcs in enumerate(GRAN):
        base = _hdbscan(clu_space, mcs)
        presets[f"{gi}|0"] = _preset(df, feat, base)
        presets[f"{gi}|1"] = _preset(df, feat, _absorb(clu_space, base))

    reduced = _reduce_for_browser(emb, 64)
    tracks_js, emb_js = [], []
    for i, tid in enumerate(ids):
        r = df.iloc[i]
        tracks_js.append({
            "id": tid, "t": str(r.get("title") or ""), "a": str(r.get("artist") or ""),
            "bpm": (float(r["bpm"]) if pd.notna(r.get("bpm")) else None),
            "key": str(r.get("key") or ""), "m": moments[i],
            "x": round(float(viz[i, 0]), 4), "y": round(float(viz[i, 1]), 4)})
        emb_js.append([round(float(x), 4) for x in reduced[i]])

    return {"tracks": tracks_js, "emb": emb_js, "presets": presets,
            "gran": GRAN, "default": len(GRAN) // 2, "label": label}


# --------------------------------------------------------------------------
def load_source(base, subdir, fallback_label, external_tracks):
    d = os.path.join(base, subdir)
    emb_npy = os.path.join(d, "embeddings.npy")
    ids_json = os.path.join(d, "embeddings_ids.json")
    if not (os.path.exists(emb_npy) and os.path.exists(ids_json)):
        return None
    emb = np.load(emb_npy)
    ids = json.load(open(ids_json))
    feat_path = os.path.join(d, "features.csv")
    feat = (pd.read_csv(feat_path, dtype={"track_id": str})
            if os.path.exists(feat_path) else pd.DataFrame({"track_id": ids}))
    tpath = (os.path.join(base, "djvibe_data", "tracks.csv") if external_tracks
             else os.path.join(d, "tracks.csv"))
    if not os.path.exists(tpath):
        tpath = os.path.join(base, "djvibe_data", "tracks.csv")
    tracks = pd.read_csv(tpath, dtype={"track_id": str}).set_index("track_id")
    label = fallback_label or _backend_label(feat)
    return {"label": label, "ids": ids, "emb": emb, "tracks": tracks, "feat": feat}


def combined(sources):
    """Fuse engines: standardize + equal-weight + concatenate over common tracks."""
    common = set(sources[0]["ids"])
    for s in sources[1:]:
        common &= set(s["ids"])
    common = [i for i in sources[0]["ids"] if i in common]
    if len(common) < 10:
        return None

    blocks = []
    for s in sources:
        idx = {t: k for k, t in enumerate(s["ids"])}
        sub = s["emb"][[idx[i] for i in common]]
        z = _standardize(sub) / np.sqrt(sub.shape[1])   # equalize block weight
        blocks.append(z)
    comb = np.concatenate(blocks, axis=1).astype(np.float32)

    merged = pd.DataFrame({"track_id": common})
    for s in sources:
        fdf = s["feat"].set_index("track_id")
        for col in fdf.columns:
            if col == "track_id":
                continue
            mapped = merged["track_id"].map(fdf[col])
            if col not in merged.columns:
                merged[col] = mapped
            elif col.startswith(("mood::", "clap::")):
                merged[col] = merged[col].fillna(mapped)
    return common, comb, sources[0]["tracks"], merged


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=".")
    ap.add_argument("--no-serve", action="store_true")
    args = ap.parse_args()

    sources = []
    seen_labels = {}
    for subdir, fb, ext in CANDIDATES:
        s = load_source(args.base, subdir, fb, ext)
        if not s:
            continue
        lbl = s["label"]
        if lbl in seen_labels:            # disambiguate duplicate labels
            seen_labels[lbl] += 1
            lbl = f"{lbl}-{seen_labels[lbl]}"
            s["label"] = lbl
        else:
            seen_labels[lbl] = 1
        sources.append(s)
        print(f"[multi] found source '{s['label']}' ({len(s['ids'])} tracks) in {subdir}")

    if not sources:
        raise SystemExit("[multi] no analyzed result sets found (looked for "
                         "djvibe_data, djvibe_clap, djvibe_data/_librosa_backup).")

    views = {}
    for s in sources:
        print(f"[multi] building view: {s['label']}")
        views[s["label"]] = compute_view(s["ids"], s["emb"], s["tracks"], s["feat"], s["label"])

    if len(sources) >= 2:
        c = combined(sources)
        if c:
            print(f"[multi] building combined view ({len(c[0])} shared tracks)")
            views["combined"] = compute_view(c[0], c[1], c[2], c[3], "combined")

    order = [s["label"] for s in sources] + (["combined"] if "combined" in views else [])
    default = "combined" if "combined" in views else order[0]
    data = {"sources": order, "default_source": default, "views": views}

    out = os.path.join(args.base, "djvibe_data")
    os.makedirs(out, exist_ok=True)
    html = TEMPLATE.replace("/*__DATA__*/",
                            "const DATA = " + json.dumps(data, ensure_ascii=False) + ";")
    out_html = os.path.join(out, "dashboard.html")
    open(out_html, "w", encoding="utf-8").write(html)
    print(f"[multi] wrote {out_html}  (sources: {', '.join(order)})")

    if not args.no_serve:
        os.environ["DJVIBE_WORKDIR"] = out
        import player_server
        player_server.serve(out, do_build=False)


TEMPLATE = r"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>djvibe · multi-engine studio</title>
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js" charset="utf-8"></script>
<style>
:root{--bg:#0d0f14;--panel:#161a23;--panel2:#1e2330;--line:#2a3040;--ink:#e8ecf4;
  --mut:#9aa6bd;--accent:#5cc8ff;--hot:#ff5c8a;--seed:#ffd166;}
*{box-sizing:border-box}
body{margin:0;font:14px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--ink);}
header{padding:14px 20px;border-bottom:1px solid var(--line);display:flex;align-items:baseline;gap:14px}
header h1{font-size:18px;margin:0}header .sub{color:var(--mut);font-size:12px}
.wrap{display:grid;grid-template-columns:340px 1fr;height:calc(100vh - 53px)}
.side{border-right:1px solid var(--line);padding:16px;overflow:auto;background:var(--panel);display:flex;flex-direction:column}
.main{position:relative}#plot{width:100%;height:100%}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut);margin:18px 0 8px}
.card{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:6px}
input,button,select{font:inherit}
select,input[type=text]{width:100%;padding:9px 10px;border-radius:8px;border:1px solid var(--line);background:var(--panel2);color:var(--ink)}
.btn{width:100%;padding:9px 10px;border-radius:8px;border:1px solid var(--line);background:var(--accent);color:#04222e;font-weight:600;cursor:pointer;margin-top:8px}
.btn.ghost{background:transparent;color:var(--mut)}
.seedlist{margin:8px 0;display:flex;flex-direction:column;gap:6px}
.seed{display:flex;align-items:center;gap:8px;background:var(--panel2);border:1px solid var(--line);border-left:3px solid var(--seed);padding:6px 8px;border-radius:6px;font-size:13px}
.seed .lbl{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.seed b{color:var(--seed)}.seed .x{cursor:pointer;color:var(--mut)}
.row{display:flex;gap:8px;align-items:center}.row label{color:var(--mut);font-size:12px;min-width:64px}
.results{margin-top:8px;display:flex;flex-direction:column;gap:5px}
.hit{display:flex;align-items:center;gap:8px;background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:7px 9px;font-size:13px}
.hit .hitbody{flex:1;cursor:pointer;overflow:hidden}.hit:hover{border-color:var(--accent)}
.hit .meta{color:var(--mut);font-size:11px;margin-top:2px;display:flex;justify-content:space-between}
.playbtn{flex:0 0 auto;width:26px;height:26px;border-radius:50%;border:1px solid var(--line);background:var(--accent);color:#04222e;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center}
.pill{display:inline-block;background:#2a3142;border-radius:20px;padding:1px 8px;font-size:10px;color:var(--accent)}
.sim{color:var(--hot);font-variant-numeric:tabular-nums}
.readout{font-size:13px;margin-top:6px}.readout b{color:var(--accent)}
.tick{display:flex;justify-content:space-between;color:var(--mut);font-size:10px;margin-top:2px}
.chk{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;cursor:pointer}
.note{color:var(--mut);font-size:11px;margin-top:6px}
.player{position:sticky;bottom:-16px;background:var(--panel);padding:10px 0 2px;margin-top:auto;border-top:1px solid var(--line)}
.player .np{font-size:12px;color:var(--seed);margin:4px 0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.player audio{width:100%;height:34px}
::-webkit-scrollbar{width:9px;height:9px}::-webkit-scrollbar-thumb{background:#2a3040;border-radius:6px}
</style></head><body>
<header><h1>djvibe</h1>
<span class="sub">multi-engine studio · <span id="ntracks"></span> tracks · <span id="statline"></span></span></header>
<div class="wrap">
  <div class="side">
    <h2>Analysis engine</h2>
    <div class="card">
      <select id="source"></select>
      <div class="note" id="srcnote"></div>
    </div>

    <h2>Cluster view</h2>
    <div class="card">
      <div class="row"><label>Detail</label><input id="gran" type="range" min="0" value="0" step="1" style="flex:1"/></div>
      <div class="tick"><span>fewer · broader</span><span>more · tighter</span></div>
      <label class="chk"><input id="absorb" type="checkbox"/> Absorb outliers</label>
      <div class="readout" id="readout"></div>
    </div>

    <h2>Seed search</h2>
    <input id="search" list="tracklist" placeholder="Type a title or artist, press Enter"/>
    <datalist id="tracklist"></datalist>
    <div class="seedlist" id="seeds"></div>
    <div class="row"><label>Show top</label><input id="topn" type="range" min="5" max="100" value="25" style="flex:1"/>
      <span id="topnval" style="width:34px;text-align:right">25</span></div>
    <button class="btn" id="find">Find similar</button>
    <button class="btn ghost" id="clear">Clear seeds &amp; reset</button>

    <h2 id="resultshdr">Results</h2>
    <div class="results" id="results"></div>

    <div class="player">
      <div class="np" id="np">▶ click any track's play button</div>
      <audio id="player" controls preload="none"></audio>
      <div class="note" id="playnote"></div>
    </div>
  </div>
  <div class="main"><div id="plot"></div></div>
</div>
<script>
/*__DATA__*/

const PAL = ['#5cc8ff','#ff5c8a','#9b8cff','#5ce1a0','#ffd166','#ff924c','#4cc9f0',
 '#f15bb5','#8ac926','#ff99c8','#b5179e','#48cae4','#fb8500','#83c5be','#e0aaff',
 '#ffadad','#a0c4ff','#caffbf','#ffd6a5','#bdb2ff','#90be6d','#f9844a','#577590','#f94144'];
const colorOf = c => c===-1 ? '#5b6373' : PAL[((c%PAL.length)+PAL.length)%PAL.length];
function esc(s){return (s||'').replace(/"/g,'&quot;').replace(/</g,'&lt;');}

// per-view state, (re)bound by setView
let T, E, byId, PRESETS, GRAN, granIdx, absorb=false, CUR, nameMap={};
let seeds=[], filterMask=[];

const player=document.getElementById('player'), np=document.getElementById('np'), playnote=document.getElementById('playnote');
function playTrack(id){const t=byId[id]; if(!t)return; player.src='/audio?id='+encodeURIComponent(id);
  np.textContent='♪ '+t.a+' — '+t.t; playnote.textContent=''; player.play().catch(()=>{});}
player.addEventListener('error',()=>{ playnote.innerHTML = (location.protocol==='file:')
  ? 'Audio needs the player — launch via build_multi.py / player_server.py.'
  : 'Could not play this file (unsupported format).';});

// ---- source selector -----------------------------------------------------
const srcSel=document.getElementById('source');
srcSel.innerHTML = DATA.sources.map(s=>`<option value="${s}">${s}</option>`).join('');
srcSel.value = DATA.default_source;
srcSel.onchange = ()=>setView(srcSel.value);

function setView(name){
  const v = DATA.views[name];
  T = v.tracks; E = v.emb; GRAN = v.gran; granIdx = v.default; PRESETS = v.presets;
  byId = {}; T.forEach((t,i)=>{t._i=i; byId[t.id]=t;});
  document.getElementById('ntracks').textContent = T.length;
  document.getElementById('srcnote').textContent = noteFor(name);
  // keep only seeds that still exist in this engine's track set
  seeds = seeds.filter(id=>byId[id]);
  filterMask = T.map(()=>true);
  const dl=document.getElementById('tracklist');
  dl.innerHTML = T.slice(0,4000).map(t=>`<option value="${esc(t.a)} — ${esc(t.t)}">`).join('');
  const g=document.getElementById('gran'); g.max=GRAN.length-1; g.value=granIdx;
  document.getElementById('results').innerHTML='';
  document.getElementById('resultshdr').textContent='Results';
  renderSeeds(); applyPreset(); draw();
}
function noteFor(name){
  if(name==='combined') return 'All engines fused — similarity reflects every analysis at once.';
  return `Viewing the "${name}" engine. Map, clusters, and similarity are all from ${name}.`;
}

function applyPreset(){
  const p = PRESETS[granIdx + '|' + (absorb?1:0)];
  CUR=p; nameMap={}; p.clusters.forEach(c=>nameMap[c.id]=c);
  for(let i=0;i<T.length;i++){ T[i].c=p.labels[i]; T[i].cn=(nameMap[T[i].c]||{}).name||''; }
  const nc=p.clusters.filter(c=>c.id!==-1).length, pct=Math.round(100*p.outliers/T.length);
  document.getElementById('statline').textContent=`${srcSel.value} · ${nc} clusters · ${p.outliers} outliers (${pct}%)`;
  document.getElementById('readout').innerHTML=`<b>${nc}</b> clusters · <b>${p.outliers}</b> outliers (${pct}%)`;
}

document.getElementById('search').addEventListener('keydown', e=>{
  if(e.key!=='Enter') return;
  const v=e.target.value.trim().toLowerCase();
  const hit=T.find(t=>(`${t.a} — ${t.t}`).toLowerCase()===v)||T.find(t=>(`${t.a} ${t.t}`).toLowerCase().includes(v));
  if(hit){ addSeed(hit.id); e.target.value=''; }
});
function addSeed(id){ if(!seeds.includes(id)){ seeds.push(id); renderSeeds(); } }
function renderSeeds(){
  const el=document.getElementById('seeds');
  el.innerHTML=seeds.map(id=>{const t=byId[id];
    return `<div class="seed"><button class="playbtn" data-play="${id}">▶</button>
      <span class="lbl"><b>${esc(t.a)}</b> — ${esc(t.t)}</span><span class="x" data-id="${id}">✕</span></div>`;}).join('');
  el.querySelectorAll('.x').forEach(x=>x.onclick=()=>{seeds=seeds.filter(s=>s!==x.dataset.id);renderSeeds();});
  el.querySelectorAll('.playbtn').forEach(b=>b.onclick=()=>playTrack(b.dataset.play));
}
function findSimilar(){
  if(!seeds.length){ alert('Add at least one seed track first.'); return; }
  const dim=E[0].length, c=new Float64Array(dim);
  seeds.forEach(id=>{const v=E[byId[id]._i];for(let k=0;k<dim;k++)c[k]+=v[k];});
  let n=0;for(let k=0;k<dim;k++)n+=c[k]*c[k];n=Math.sqrt(n)||1;for(let k=0;k<dim;k++)c[k]/=n;
  const ss=new Set(seeds),scored=[];
  for(let i=0;i<T.length;i++){ if(!filterMask[i]||ss.has(T[i].id))continue;
    const v=E[i];let d=0;for(let k=0;k<dim;k++)d+=c[k]*v[k];scored.push([d,i]); }
  scored.sort((a,b)=>b[0]-a[0]);
  const top=scored.slice(0,+document.getElementById('topn').value);
  renderResults(top); highlight(top.map(s=>s[1]));
}
function renderResults(top){
  document.getElementById('resultshdr').textContent=`Results — ${top.length} most similar`;
  document.getElementById('results').innerHTML=top.map(([d,i])=>{const t=T[i];
    return `<div class="hit"><button class="playbtn" data-play="${t.id}">▶</button>
      <div class="hitbody" data-id="${t.id}"><div><b>${esc(t.a)}</b> — ${esc(t.t)}</div>
      <div class="meta"><span>${t.bpm?Math.round(t.bpm)+' BPM':''} ${t.key?'· '+esc(t.key):''}
       · <span class="pill">${esc(t.m)}</span></span><span class="sim">${(d*100).toFixed(0)}%</span></div></div></div>`;}).join('');
  document.querySelectorAll('.hit .hitbody').forEach(h=>h.onclick=()=>addSeed(h.dataset.id));
  document.querySelectorAll('.hit .playbtn').forEach(b=>b.onclick=()=>playTrack(b.dataset.play));
}
function baseTraces(){
  const groups={}; T.forEach((t,i)=>{ if(!filterMask[i])return; (groups[t.c]=groups[t.c]||[]).push(t); });
  return CUR.clusters.map(cl=>{ const pts=groups[cl.id]||[];
    return {type:'scattergl',mode:'markers',name:`${cl.name} (${cl.count})`,
      x:pts.map(p=>p.x),y:pts.map(p=>p.y),customdata:pts.map(p=>p.id),
      text:pts.map(p=>`<b>${esc(p.a)}</b> — ${esc(p.t)}<br>${p.bpm?Math.round(p.bpm)+' BPM ':''}${p.key||''}<br>${esc(p.cn)}<br><i>${esc(p.m)}</i>`),
      hovertemplate:'%{text}<extra></extra>',marker:{size:6,color:colorOf(cl.id),opacity:.78}};});
}
function layout(){return {paper_bgcolor:'#0d0f14',plot_bgcolor:'#0d0f14',font:{color:'#9aa6bd'},
  margin:{l:10,r:10,t:10,b:10},xaxis:{visible:false},yaxis:{visible:false},
  legend:{font:{size:11},bgcolor:'rgba(22,26,35,.6)'},
  hoverlabel:{bgcolor:'#1e2330',bordercolor:'#2a3040',font:{color:'#e8ecf4'}}};}
function draw(){Plotly.react('plot',baseTraces(),layout(),{responsive:true,displaylogo:false});attachClick();}
function highlight(idxs){ draw();
  const hl={type:'scattergl',mode:'markers',name:'similar',showlegend:false,
    x:idxs.map(i=>T[i].x),y:idxs.map(i=>T[i].y),customdata:idxs.map(i=>T[i].id),
    text:idxs.map(i=>`<b>${esc(T[i].a)}</b> — ${esc(T[i].t)}`),hovertemplate:'%{text}<extra></extra>',
    marker:{size:11,color:'#ff5c8a',line:{width:1.5,color:'#fff'},opacity:.95}};
  const sd={type:'scattergl',mode:'markers',name:'seeds',showlegend:false,
    x:seeds.map(id=>byId[id].x),y:seeds.map(id=>byId[id].y),
    text:seeds.map(id=>`SEED: ${esc(byId[id].a)} — ${esc(byId[id].t)}`),hovertemplate:'%{text}<extra></extra>',
    marker:{size:15,color:'#ffd166',symbol:'star',line:{width:1.5,color:'#fff'}}};
  Plotly.addTraces('plot',[hl,sd]);attachClick();}
function attachClick(){document.getElementById('plot').on('plotly_click',ev=>{const id=ev.points[0].customdata;if(id)addSeed(id);});}

document.getElementById('gran').oninput=e=>{granIdx=+e.target.value; applyPreset(); draw();};
document.getElementById('absorb').onchange=e=>{absorb=e.target.checked; applyPreset(); draw();};
document.getElementById('topn').oninput=e=>document.getElementById('topnval').textContent=e.target.value;
document.getElementById('find').onclick=findSimilar;
document.getElementById('clear').onclick=()=>{seeds=[];renderSeeds();filterMask=T.map(()=>true);
  document.getElementById('results').innerHTML='';document.getElementById('resultshdr').textContent='Results';draw();};

setView(DATA.default_source);
</script></body></html>
"""

if __name__ == "__main__":
    main()
