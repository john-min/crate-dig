# Crate Dig Design Refinement Spec

Status: Draft  
Last updated: 2026-08-20  
Source evidence:

- [design.md](./design.md)
- [PRD.md](./PRD.md)
- [crate-dig_deisgn_system_v1.html](./crate-dig_deisgn_system_v1.html)
- [.impeccable/critique/2026-08-20T22-48-23Z__crate-dig-deisgn-system-v1-html.md](./.impeccable/critique/2026-08-20T22-48-23Z__crate-dig-deisgn-system-v1-html.md)

## 1. Purpose

This spec translates the Impeccable critique of the Claude Design v1 export into concrete design and implementation requirements for Crate Dig.

The goal is not to patch the bundled HTML export. Treat `crate-dig_deisgn_system_v1.html` as evidence. Future work should produce a cleaner Claude Design v2 output and then implement the real app in Next.js/React.

Known but out of scope for this pass:

- Removing or redesigning the Claude prototype screen-picker / presentation navigation.

In scope:

- Map explainability and trust.
- Q behavior and language.
- Production hardening / edge cases.
- Accessibility and keyboard model.
- Typography and contrast.
- Layout and responsive structure.
- Import/export safety.
- Privacy/storage mode clarity.

## 2. Preserve from v1

The v1 direction is strong and should not be discarded.

Keep:

- Dark, nocturnal, focused product atmosphere.
- Refined DJ-tool feel, more elegant than Rekordbox.
- Linear-like restraint, but warmer and more music-native.
- Map / constellation / spectrum motifs.
- Sonic accent colors with semantic meaning.
- Q as a contextual assistant, not generic chatbot.
- Import and analysis as a calm, reassuring sequence.
- Crate-building around set intention, energy arc, key flow, room, time of day, and handover.

The best product language from v1 should survive:

- “Find the next record.”
- “Q answers in records, not paragraphs.”
- “A map is forming.”
- “Warm Rollers,” “Dub Chamber,” “Neon Peak,” and similar cluster names.
- Records, crates, warm-up, afterhours, handover, BPM, Camelot key, energy arc.

## 3. Refinement thesis

Crate Dig v2 should feel less like a beautiful mockup and more like a trustworthy working tool for DJs.

That means:

- The map explains why records are close.
- Q shows why it recommends something.
- File/import/export actions are visibly safe.
- Local/cloud privacy boundaries are exact.
- Dense data remains readable.
- Power users can move quickly.
- Accessibility is part of the design contract.

## 4. Screen-by-screen requirements

### 4.1 Landing page

Requirements:

- Give “Find the next record” hero-level prominence.
- Explain the product loop: import → analyze → map → ask Q → build crate.
- Show web and Mac positioning:
  - Web: demo/shareable/cloud analysis.
  - Mac: local/offline/serious DJ library.
- Use the map visual to teach the concept, not just decorate.
- Keep copy DJ-specific.

Suggested copy:

> Turn your music library into a map of what actually fits together.

> Import tracks, analyze the sound, explore clusters, and ask Q for the next record.

CTA:

- Start digging
- Analyze your library
- See how the map works

### 4.2 Auth / access-code flow

Requirements:

- Support access code before account creation.
- Support Google SSO and email/password.
- Show privacy reassurance.
- Use exact storage wording:

> Your music files stay local on Mac unless you choose cloud upload.

> Web demo uploads are private and access-controlled.

States:

- Enter access code.
- Invalid/expired/redeemed access code.
- Continue with Google.
- Email/password sign-up.
- Password reset.

### 4.3 Import / upload flow

Requirements:

- Show source choice:
  - Web upload.
  - Mac local folder.
  - Rekordbox XML import.
- Show supported formats: MP3, WAV, AIFF, FLAC, M4A.
- Explicitly state that import is non-destructive.

Core trust copy:

> Import is non-destructive. Crate Dig reads your files, builds its own library index, and does not rename, move, delete, or retag originals without explicit permission.

Required states:

1. Clean import scan.
2. Duplicate review.
3. Unsupported files.
4. Missing metadata.
5. Web upload failure.
6. Mac folder permission failure.
7. Very large import.

Duplicate review:

- Show duplicate groups, not just a count.
- Include title/artist, duration, bitrate/file type, path, date modified, fingerprint confidence.
- Actions:
  - Review duplicates.
  - Use highest quality copy.
  - Keep both.
  - Choose manually.

Suggested duplicate copy:

> 38 likely duplicates. Same audio fingerprint, different filenames or bitrates. Crate Dig will not delete files. Choose which copy appears in the map.

Missing metadata:

- Show missing fields by track.
- Show confidence for suggestions.
- Actions:
  - Review suggestions.
  - Accept high-confidence only.
  - Leave blank.

Suggested metadata copy:

> 24 tracks missing artist or title. We can suggest metadata from file names and acoustic fingerprint matches. Nothing is written back to your audio files unless you choose it.

Unsupported files:

> 6 unsupported files. These files will be skipped for analysis. They will remain in your folder and can be imported later if support is added.

Very large import:

- Example: 42,812 tracks · 2.1 TB.
- Show estimated time, cache size, batch analysis option, pause/resume, metadata-first option.

### 4.4 Analysis progress

Required stages:

- Reading metadata.
- Decoding audio.
- Extracting BPM / key / loudness.
- Generating audio features.
- Generating embeddings.
- Clustering by similarity.
- Creating waveform previews.

Required states:

- Running normally.
- Partial failure.
- Stalled analysis.
- Paused/resumable.
- Cancel confirmation.
- Model/pipeline update available.
- Offline desktop analysis.

Partial failure:

> 1,221 analyzed · 51 warnings · 12 failed.

Actions:

- Retry failed.
- Export error report.
- Continue to map with analyzed tracks.
- View failed tracks.

Stalled:

> No progress for 8 minutes while decoding audio.

Actions:

- Keep waiting.
- Restart stage.
- Skip current file.
- Export diagnostics.

Cancel/pause must state what is preserved.

### 4.5 Main discovery map

This is the central product surface.

Default layout:

- Primary: map.
- Secondary: candidate/track list.
- Persistent: audio player.
- Supporting: left navigation/filters.
- Contextual: Q sidecar/drawer.
- Detail: track drawer.

Default cognitive-load rule:

- Start with search/seed, map, candidate list, and player.
- Keep Q collapsed/contextual by default.
- Put advanced filters behind a progressive disclosure control.
- Avoid showing every filter group at equal visual weight.

Required map trust components:

1. `MapTrustBar`
2. `SimilarityReasonStack`
3. `ClusterExplanationCard`
4. `MapLegend`
5. `MapFallbackList`

`MapTrustBar` must show:

- visible records vs full library count
- selected seed track(s)
- active filters
- color-by mode
- similarity definition
- analysis/model version

Sample copy:

> 1,284 analyzed records arranged by sonic similarity. Nearby records share audio features like rhythm, texture, brightness, low-end weight, tempo, and key movement. Color is currently showing mood.

Seed selected:

> Similar to “Nocturne Transit” · 18 candidates · 122 BPM ±4 · compatible keys · warm/percussive filter on.

Filtered:

> Showing 214 of 1,284 records. Hidden records are outside your BPM, mood, or texture filters.

How-to-read tooltip:

> Distance means sound, not genre. Records closer together share more measured audio traits. Color shows the selected dimension. Cluster names are generated from common traits and can be edited.

Similarity tooltip:

> Similarity score compares this record to your selected seed. 1.00 means very close. 0.80+ is usually worth auditioning. Scores do not guarantee a clean mix.

Reason stack:

- Shared rolling percussion.
- 122 BPM vs 120 BPM.
- Compatible key: 8A → 9A.
- Similar low-mid weight.
- Slightly darker vocal texture.

No-results actions:

- Clear all filters.
- Widen BPM range.
- Include adjacent keys.
- Ask Q to loosen search.
- Search whole library.

Map failure states:

- No imported library.
- Imported but not analyzed.
- Filters returned no results.
- WebGL unavailable.
- Large library aggregation mode.

### 4.6 Track list / table

Track rows must support two density modes:

- Comfortable: 44px.
- Compact: 38px.

Text:

- Title: 13px / 18px, 500.
- Artist: 12px / 16px, readable secondary.
- BPM/key/duration/similarity: 12px / 16px, tabular numbers.
- Tags: 11–12px, max two visible, overflow as `+2`.

Required row states:

- Normal.
- Hover/focus.
- Selected.
- Playing.
- Selected + playing.
- Missing metadata.
- Failed analysis.
- Duplicate marker.
- Very long title/artist.

Behavior:

- Row is keyboard selectable.
- Play, add-to-crate, and overflow are independently focusable.
- Long text truncates in compact mode with accessible full text.
- Missing BPM/key/genre appears as `—`.
- Failed analysis and duplicate states link to recovery actions.

### 4.7 Track detail drawer

Required states:

- Fully analyzed track.
- Missing artwork/metadata.
- Failed waveform/previews.
- Hidden-from-recommendations.
- Edited tags with unsaved changes.
- Similar tracks empty state.
- Long notes/label/remixer field.
- Q loading/error when asking about track.

Behavior:

- Close returns focus to invoking point or row.
- Playback controls are usable without closing drawer.
- Hide from recommendations has confirmation and undo.
- Edit tags distinguishes Crate Dig tags from source-file metadata.

### 4.8 Q assistant

Q should be contextual and action-first.

Posture:

- Collapsed/contextual by default.
- Docked only on sufficiently wide desktop.
- Overlay/drawer on laptop/tablet.
- Focused bottom/side sheet on narrow web.

Composer placeholder:

> Ask Q for records, transitions, or crate shape…

Empty state:

> Where are we digging tonight? Select a record, lasso a region, or describe the moment. Q will return records and actions, not a chat thread.

Required Q states:

1. No context.
2. Track selected.
3. Multiple tracks selected.
4. Crate in progress.
5. Loading.
6. No results.
7. Failure/offline/model unavailable.
8. Privacy boundary when cloud Q is requested from local-only desktop.

Track-selected:

> Q found 18 nearby records. Same low-mid movement, compatible keys, and warm percussion. Three are safer blends; two are better pivots.

Recommendation card:

> Low Ceiling — Sordid Palm  
> 0.94 match · 120 BPM · 9A  
> Same rolling percussion and darker room tone. Safer than it looks: 8A → 9A works cleanly.

Actions:

- Preview all.
- Reveal on map.
- Add selected to crate.
- Find darker nearby.
- Find safer blends.
- Find energy lift.
- Hide from this search.

No-results:

> Q didn’t find a confident match.

Show the constraints that blocked results and offer loosening actions.

Failure:

> Q couldn’t finish that search. Your library and crate are unchanged. Try again, or narrow by BPM, key, or mood.

Privacy boundary:

- Show what context would be sent.
- Offer local-only Q, one-time cloud request, or cancel.

### 4.9 Crates / playlists

Required states:

- Normal saved crate.
- Empty crate.
- Reordering with undo.
- Removing tracks with undo.
- Key clash / energy dip review.
- Duplicate tracks in crate.
- Long notes with autosave/error.

Normal crate shows:

- ordered list
- total runtime
- BPM range
- key compatibility
- energy arc
- notes / set intention
- room / time of day
- handover target

Key clash example:

> Track 9 → 10 jumps 11A → 8A. Q suggests one bridge record that keeps the warmth.

Actions:

- Accept.
- Ask Q for bridge.
- Replace track.
- Ignore warning.

### 4.10 Export flow

Export must be a review flow.

Formats:

- CSV.
- M3U.
- Rekordbox XML playlist.
- Share web preview.

Preflight must show:

- format
- destination
- track count
- runtime
- BPM range
- included metadata
- excluded fields
- path warnings
- confirmation that Rekordbox internal DB is not mutated

Rekordbox warning:

> Rekordbox XML export creates a new playlist file. It does not modify your Rekordbox database. Import the XML inside Rekordbox to review before using it in the booth.

Before export:

> Export “Sunset lounge” to Rekordbox XML?  
> 14 tracks · 47 min · 112–124 BPM  
> Crate Dig will include track paths and playlist order. Cue points, beatgrids, hot cues, and My Tags are not included in this MVP export.

Path warning:

> 3 tracks may not resolve in Rekordbox. These files are on an external volume or have moved since import. Review paths before exporting.

Success:

> Export ready. “Sunset lounge.xml” was created. Import it from Rekordbox’s XML playlist import flow to review the crate.

Failure:

> Export failed. Your crate is unchanged. Crate Dig could not write to that location. Choose another folder or check disk permissions.

### 4.11 Settings / privacy

Settings must make local/cloud boundaries explicit.

Intro:

> Choose where audio, analysis, and crate metadata live. You can change modes later. Crate Dig never uploads local audio from the Mac unless you explicitly enable cloud upload.

Local only:

> Audio, analysis, embeddings, waveforms, and crates stay on this Mac. Nothing is uploaded. Q uses local library data where available.

Cloud demo:

> Upload selected audio for browser playback and cloud analysis. Files are private, access-controlled, and deleted after 30 days unless you keep the demo library.

Metadata-only sync:

> Sync crates, tags, fingerprints, analysis summaries, and map positions between web and Mac. Original audio is not uploaded.

Switching local → cloud must show:

- what uploads
- estimated size
- filenames/metadata included
- retention period
- cancel action

Deletion:

> Permanently removes uploaded audio, previews, waveform files, and cloud analysis artifacts. Local Mac files and local crates are not affected.

### 4.12 Mac desktop

The Mac app must feel native enough for serious local-library work.

Required:

- Native-feeling title bar.
- Local folder permissions.
- Offline status.
- Local playback.
- Local analysis engine/model status.
- SQLite/local library indicator.
- Cache/model/storage settings.
- Keyboard shortcuts and menu/preference affordances.

Offline state:

> Offline · local analysis available.

Show:

- local playback works
- local analysis works if models are installed
- cloud Q/sync/upload unavailable
- export to local files works
- queued cloud sync actions

Model missing:

> Deep analysis model not installed.

Actions:

- Download now.
- Use fast local analysis.
- Choose model folder.

## 5. Layout rules

### 5.1 Primary app hierarchy

Priority order:

1. Current musical context: selected/playing track and active search/seed.
2. Map: spatial discovery.
3. Candidate list: actionable next records.
4. Player: audition and confidence.
5. Q: contextual reasoning and next moves.
6. Filters/crates/settings: supporting controls.

### 5.2 Q layout

- Closed by default in the main map unless invoked.
- Opens docked on wide screens.
- Opens as overlay/drawer on laptop/tablet.
- Track drawer and Q should be mutually exclusive on laptop widths.
- Q cards should be action cards, not chat bubbles.

### 5.3 Filters

- Default filter rail should show only high-signal filters:
  - search/seed
  - BPM
  - key
  - mood/energy
  - clear all
- Advanced filters behind “More filters.”
- Active filter count always visible.
- No-results recovery visible when filters produce zero tracks.

### 5.4 Responsive behavior

Desktop ≥1440:

- Full command center: left rail, map, bottom list, Q if open, player.

Laptop 1180–1439:

- Q collapsed by default.
- Q drawer overlays map/list.
- Track drawer and Q mutually exclusive.

Tablet 900–1179:

- Filter rail becomes chip bar + sheet.
- Map/list split view.
- Q as modal side sheet.

Small web 640–899:

- Segmented control: Map / List / Crate.
- Track drawer as bottom sheet.
- Sticky player.

Mobile <640:

- Auditioning and light crate review only.
- No heavy import/analysis.
- Handoff copy for desktop import/analysis.

## 6. Accessibility requirements

Design must specify:

- Real semantic controls.
- Visible focus rings.
- Keyboard shortcuts.
- Screen-reader live regions.
- Accessible names for icon-only controls.
- Non-map discovery equivalent.
- Reduced-motion mode.
- Minimum touch targets.
- Color-independent status cues.

Required live regions:

- upload progress
- analysis progress
- import warnings
- selection count changes
- Q result completion/failure
- export completion/failure
- playback state changes

Suggested shortcuts:

- `/` or `⌘F`: focus search.
- `⌘K`: command palette.
- `Space`: play/pause when not typing.
- `J/K` or arrows: move through track rows.
- `Enter`: open selected track detail.
- `A`: add selected/focused track to active crate.
- `Q`: open/focus Q.
- `Esc`: close drawer/menu/Q overlay or cancel lasso.
- `Shift + Arrow`: extend row selection.
- `⌘Z`: undo last reversible action.

Map keyboard:

- canvas focus label describes current view
- arrow keys pan
- `+` / `-` zoom
- Esc cancels lasso
- jump to selected/playing track
- select visible cluster / nearest 20 / filtered results alternatives

## 7. Typography tokens

Use a two-family system:

- `--font-ui`: Instrument Sans or equivalent.
- `--font-display`: Instrument Serif or equivalent.

Do not introduce a monospace unless absolutely necessary.

Suggested CSS token starter:

```css
:root {
  --font-ui: "Instrument Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-display: "Instrument Serif", Georgia, serif;

  --type-micro: 0.6875rem;      /* 11px */
  --type-caption: 0.75rem;      /* 12px */
  --type-meta: 0.8125rem;       /* 13px */
  --type-body: 0.875rem;        /* 14px */
  --type-body-lg: 1rem;         /* 16px */
  --type-title-sm: 1.125rem;    /* 18px */
  --type-title-md: 1.5rem;      /* 24px */
  --type-title-lg: 2rem;        /* 32px */

  --leading-caption: 1rem;
  --leading-meta: 1.125rem;
  --leading-body: 1.25rem;
  --leading-copy: 1.5rem;

  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;

  --track-row-compact: 2.375rem;     /* 38px */
  --track-row-comfortable: 2.75rem;  /* 44px */
}
```

Text color tokens:

```css
:root {
  --text-primary: #E7E9EE;
  --text-strong: #FFFFFF;
  --text-secondary: #A8B0BE;
  --text-muted: #7F8998;
  --text-disabled: #626B7A;
  --text-on-accent-dark: #0B0D10;
}
```

Rules:

- No critical or functional text below 12px.
- Use `#626B7A` only for disabled/waiting/decorative states.
- Use tabular numbers for BPM, key, duration, similarity, counts, runtime, and storage.
- Instrument Serif is display-only, not dense UI.

## 8. Component requirements

### MapCanvas

States:

- loading
- no library
- not analyzed
- normal
- no results
- selected point
- selected cluster
- large-library aggregated
- WebGL unavailable

Requirements:

- keyboard/fallback behavior
- map trust layer
- non-map list alternative
- selected/playing highlights
- hover/focus card

### MapTrustBar

Displays:

- visible count / total
- seed
- active filters
- color mode
- similarity definition
- model/version

### SimilarityReasonStack

Displays:

- 3–5 concrete audible reasons
- BPM/key distance
- score with explanation
- warning if match is risky

### FilterRail

States:

- default
- filters active
- advanced expanded
- no-results recovery
- mobile sheet

### TrackRow

States:

- normal
- hover/focus
- selected
- playing
- selected + playing
- missing metadata
- failed analysis
- duplicate
- long title

### QPanel

States:

- collapsed
- no context
- track selected
- multi-selection
- crate in progress
- loading
- no results
- failure/offline
- privacy confirmation

### CratePanel

States:

- empty
- saved
- reorder with undo
- remove with undo
- key clash
- energy dip
- duplicate track
- export preflight

### AudioPlayer

States:

- no track loaded
- loading
- playing
- paused
- buffering
- failed playback
- missing local file
- signed URL expired

### AnalysisRunStatus

States:

- queued
- running
- paused
- stalled
- partial failure
- completed with warnings
- completed
- cancelled
- offline local
- re-analysis recommended

### UploadDropzone

States:

- empty
- dragging
- scanning
- clean
- duplicates
- missing metadata
- unsupported files
- upload failed
- permission denied
- large import

### ExportSafetyDialog

States:

- preflight
- path warnings
- compatibility warning
- success
- failure

### StorageModeExplainer

States:

- local only
- cloud demo
- metadata-only sync
- switching confirmation
- deleting cloud library
- offline disabled cloud controls

## 9. Copy and terminology guidelines

Use:

- “records” for discovery/user-facing collection language.
- “tracks” for table/detail language.
- “audio files” for import/storage/file-system language.
- “crates” for saved groups.
- “nearby” for map/similarity relationships.
- “compatible key” rather than “safe key” when precision matters.

Avoid:

- vague “AI found”
- generic “submit,” “ok,” “continue” when outcome matters
- “delete” unless files/data are truly deleted
- implying source files are modified by default
- spy-themed Q language

Label improvements:

- “Similar to selected” → “Near selected.”
- “Show on map” → “Reveal on map.”
- “Explain this cluster” → “Why these are grouped.”
- “Find darker” → “Find darker nearby.”
- “Lower energy” → “Lower energy, same vibe.”
- “Keep best” → “Review duplicates.”
- “Auto-fill” → “Review metadata.”
- “Skip” → “Skip unsupported.”
- “Cloud demo” → “Cloud demo upload.”

## 10. Engineering implications

Recommended frontend libraries from PRD remain sound:

- Next.js + TypeScript + React.
- Tailwind CSS.
- Radix UI or shadcn/ui for accessible primitives.
- Deck.gl with OrthographicView for map.
- TanStack Query or SWR for server state.
- Zustand or Jotai for local UI state.

Implementation notes:

- Do not build critical interactions as anonymous `div`s.
- Map points should not all be individually tabbable at large counts.
- Use virtualized lists for large libraries.
- Use signed URLs for private playback.
- Add optimistic updates with undo for crate edits.
- Preserve completed analysis work across failures.
- Treat map view state, filter state, active seed, selected cluster, selected tracks, player state, and Q context as explicit app state.

## 11. Open questions

1. Should Q be collapsed by default in all map states, or open by default only on very wide desktop?
2. What exact fields are safe to send to cloud Q in local-only desktop mode, if any?
3. What similarity score calibration should be shown to users? Is `0.80+ worth auditioning` empirically true after we test?
4. Which Rekordbox XML fields are included in MVP export beyond track path and playlist order?
5. Should metadata edits ever write back to source audio files, or remain Crate Dig-only for MVP?
6. What should be the first non-map fallback: table, cluster list, or “nearby records” list?
7. Which typeface pairing should be final once the app is implemented: Instrument Sans/Serif, or a more distinctive but still restrained alternative?

## 12. Recommended next step

Use [CLAUDE_DESIGN_V2_PROMPT.md](./CLAUDE_DESIGN_V2_PROMPT.md) to generate a cleaner Claude Design v2 output.

After that:

1. Re-run Impeccable critique on the v2 output.
2. Choose the production UI component architecture.
3. Implement the first real Next.js screens using semantic components and the refinement requirements above.
