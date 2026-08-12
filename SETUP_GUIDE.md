# djvibe — Setup Guide (Mac, no coding needed)

You'll copy a line, paste it into one app (Terminal), and press Enter. That's the
whole skill. Take it one step at a time — you can't break anything.

A few words you'll see:
- **Terminal** = a plain Mac app where you type commands. It's already on your Mac.
- **Python** = the free language this tool is written in. You install it once.
- **command** = a line of text you paste and run by pressing Enter.

---

## STEP 1 — Install Python (one time, ~3 min)

1. Go to **https://www.python.org/downloads/**
2. Click the big yellow button: **Download Python 3.12.x**.
3. Open the downloaded file and click **Continue → Continue → Agree → Install**
   (use the default options). Enter your Mac password if asked.
4. Done. You can close the installer.

---

## STEP 2 — Unzip the toolkit (~1 min)

1. Find **djvibe-toolkit.zip** (probably in your **Downloads** folder).
2. Double-click it. It creates a folder called **djvibe**.
3. Open that **djvibe** folder once in Finder. You should see a file called
   `README.md` and another folder also named `djvibe`. Good — that outer folder
   is the one we'll use in Step 4.

---

## STEP 3 — Open Terminal (~30 sec)

1. Press **Command (⌘) + Space** to open Spotlight search.
2. Type **Terminal** and press **Enter**. A window with a blinking cursor opens.
3. (Optional sanity check) Paste this and press Enter:

   ```
   python3 --version
   ```

   It should print something like `Python 3.12.4`. If it says "command not found",
   close Terminal, reopen it, and try again.

---

## STEP 4 — Go into the toolkit folder (~30 sec)

In Terminal, type the three letters `cd` and **one space**, but DON'T press Enter:

```
cd 
```

Now **drag the outer `djvibe` folder** (the one containing `README.md`) from Finder
**onto the Terminal window** and let go. Terminal fills in the path for you. Now
press **Enter**.

That's the "drag-and-drop" trick — it saves you from typing a long path.

---

## STEP 5 — Install the tool's parts (~3–5 min, one time)

Paste this and press Enter (it downloads everything; some scrolling text is normal):

```
python3 -m pip install --upgrade pip
```

Then paste this and press Enter:

```
python3 -m pip install numpy pandas scikit-learn pyrekordbox librosa soundfile umap-learn hdbscan
```

Wait until the cursor comes back and it stops printing. ✅ Done.

> **If you see red error text mentioning `hdbscan` or `umap`:** no problem. Run this
> shorter line instead — the tool still works fine without them:
>
> ```
> python3 -m pip install numpy pandas scikit-learn pyrekordbox librosa soundfile
> ```
>
> **If you see errors mentioning `pyrekordbox`:** skip it for now and use the XML
> method in Step 6b below (it doesn't need pyrekordbox).

---

## STEP 6 — Read your rekordbox library

**Quit rekordbox first** (rekordbox menu → Quit). It locks its own library while open.

### 6a — The easy way (try this first)

```
python3 -m djvibe extract
```

If it prints something like `[extract] 2847 tracks` — great, skip to Step 7.

### 6b — If 6a gives an error about a "key" or can't find the database

Do a quick export from inside rekordbox instead:

1. Open **rekordbox** → **Preferences** (⌘,) → **Advanced** tab → **Database**.
2. Find **"rekordbox xml"**, turn it on, and click the field to choose where to
   save the file (e.g. your Desktop). Note the file name (e.g. `rekordbox.xml`).
3. Top menu: **File → Export Collection in xml format** (or it auto-creates from
   the setting above). **Quit rekordbox.**
4. Back in Terminal, paste the next line, then a space, then **drag the exported
   `.xml` file onto the Terminal window**, then press Enter:

   ```
   python3 -m djvibe extract --xml 
   ```

   (After dragging, the line will look like `... extract --xml /Users/you/Desktop/rekordbox.xml`.)

---

## STEP 7 — Analyze the audio (the long step — but you can walk away)

```
python3 -m djvibe analyze --backend librosa
```

This listens to each track and measures its character. For ~3000 tracks expect
roughly **25–50 minutes**. It prints progress like `250/2847`. 

**Good to know:** it's safe to stop anytime (close Terminal or press Control+C) and
re-run the same line later — it picks up exactly where it left off.

---

## STEP 8 — Find the clusters and build your dashboard (~1 min)

```
python3 -m djvibe cluster
```

```
python3 -m djvibe dashboard
```

---

## STEP 9 — Open your dashboard 🎉

In Finder, inside your `djvibe` folder, open the new **`djvibe_data`** folder and
double-click **`dashboard.html`**. It opens in your web browser.

- Type a track in the search box and press Enter (or click any dot) to add a
  **seed**.
- Set "Show top N", click **Find similar** — the closest-sounding tracks light up
  pink and list with a % match.
- Use the BPM filter to keep results in a mixable tempo range.

---

## (Optional, later) STEP 10 — Make a rekordbox playlist of the clusters

```
python3 -m djvibe writeback
```

This writes `djvibe_data/djvibe_rekordbox.xml`. In rekordbox, point Preferences →
Advanced → Database → "rekordbox xml" at that file; the cluster playlists appear
under the "rekordbox xml" tree, ready to drag into your collection. It never
changes your real library.

---

## Phase 2 (optional upgrade) — mood/genre cluster names

The Phase-1 setup names clusters by tempo and energy (e.g. *"bright & driving ·
126 BPM"*). To get mood/genre names (e.g. *"groovy / uplifting · 122 BPM"*) you can
add the Essentia audio-AI backend. On Apple Silicon Macs this one is genuinely
fiddly to install, so it's optional. If you want it:

```
python3 -m pip install essentia-tensorflow
```

Then re-run:

```
python3 -m djvibe analyze --backend essentia
python3 -m djvibe cluster
python3 -m djvibe dashboard
```

If that `pip install` throws errors, don't fight it — message me and I'll either
walk you through the Docker method or set it up live with you. Your Phase-1
dashboard already does the main job (the similarity search) without it.

---

## If you get stuck

Copy the red error text and send it to me. Almost every issue is a one-line fix.
Common ones:
- **"command not found: python3"** → reopen Terminal after installing Python.
- **"No such file or directory"** → you're not in the right folder; redo Step 4.
- **rekordbox errors** → make sure rekordbox is fully quit, then retry.
