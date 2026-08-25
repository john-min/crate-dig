# Crate Dig — Claude Design V2 Prompt

Use this prompt with Claude Design to generate a second-pass Crate Dig design. Preserve the strong v1 visual direction, but solve the trust, accessibility, hardening, typography, and layout problems identified in the Impeccable critique.

```txt
You are Claude Design. Create a refined v2 product design system and high-fidelity screens for “Crate Dig.”

Product name: Crate Dig
Tagline: Find the next record.
AI assistant name: Q

Crate Dig helps DJs and serious music collectors import a music library, analyze tracks, cluster records by sonic similarity and vibe, explore the collection as an interactive map, audition tracks, ask Q for contextual recommendations, and build/export crates for specific moments in a set.

The product must support:
1. A responsive web app demo.
2. A future Mac desktop app for local/offline DJ-library use.

Preserve the v1 direction:
- Dark, nocturnal, refined, tactile, and focused.
- More minimal and elegant than Rekordbox, but still professional.
- Linear-like restraint, but warmer and more music-native.
- Map / constellation / spectrum / waveform / record-bag metaphors.
- Color used as musical information, not generic neon decoration.
- Q as a quiet crate-digging companion, not a generic chatbot.
- Import and analysis should feel calm, safe, and trustworthy.
- Crate-building should feel like shaping a set, not managing a database.

Do not focus this pass on the prototype screen-picker / design presentation navigation. That is out of scope. Focus on the actual product screens and components.

Primary v2 objective:
Make Crate Dig feel like a trustworthy working tool for DJs, not only a beautiful concept. The map must be explainable. Q must be actionable. Import/export decisions must be safe. Typography must be production-readable. Accessibility and edge states must be designed, not implied.

## Design principles

1. The core user question is: “What should I play next?”
2. The map must be decision-grade, not decorative.
3. Q answers in records, not paragraphs.
4. Playback is central and persistent.
5. Local files are precious; every file/library action must feel reversible or clearly safe.
6. Advanced controls should be progressive, not sprayed across the first view.
7. Dense DJ metadata is allowed, but never by shrinking critical text below readable size.
8. Every visual control should imply a real semantic implementation: buttons, inputs, tabs, toggles, menus, focus states, keyboard behavior, and screen-reader labels.

## Visual style

- Base: dark graphite / ink, not pure black.
- Contrast: soft but readable; avoid low-contrast metadata.
- Accent palette: amber, violet, cyan, blue, coral, lime. Use accents to encode musical meaning: warmth, mood, energy, key, similarity, warning, local/safe state.
- Avoid generic AI gradients, crypto dashboards, glassmorphism overload, and neon for its own sake.
- Use depth sparingly. Avoid the repeated “1px border + giant shadow” look.
- Motion should be subtle, fast, and meaningful. Respect reduced-motion.

## Typography requirements

Use a restrained two-family system:
- UI family: Instrument Sans or a similarly precise modern sans.
- Display accent: Instrument Serif or equivalent, used sparingly for landing hero, empty-state moments, and high-level brand expression.

Do not add a monospace face unless a specific production role absolutely requires it.

Production type scale:
- No functional text below 12px.
- 11px is allowed only for non-critical decorative badges.
- Body/control text should generally be 14px minimum.
- Long privacy/settings/help copy should be 14–16px.
- Track metadata can be dense at 12–13px only if contrast is strong.
- Use tabular numerals for BPM, key, duration, similarity, runtime, counts, and storage sizes.

Suggested roles:
- Display: landing hero only, clamp-based, editorial.
- Screen title: 24–32px.
- Panel title: 18px.
- Body/control: 14px.
- Metadata/reason text: 12–13px.
- Table header/caption: 11–12px, uppercase with slight tracking.

Contrast rules:
- Primary text on dark backgrounds should feel crisp.
- Secondary metadata should meet readable contrast, not sit at “disabled” contrast.
- Reserve muted/disabled gray for unavailable or waiting states only.
- Q reasoning text and map explanations are decision-critical; do not treat them as decorative microcopy.

## Core screens to design

Create high-fidelity designs for these screens and states:

1. Landing page
2. Login / sign-up / access-code flow
3. Import / upload flow
4. Import warning review states
5. Analysis progress
6. Analysis partial failure / recovery
7. Main library map / discovery screen
8. Main map empty/no-results state
9. Track detail / similarity drawer
10. Q assistant panel with multiple states
11. Saved crate / playlist screen
12. Export preflight / export failure states
13. Settings / privacy / storage modes
14. Mac desktop app variant
15. Mac offline/local analysis state
16. Responsive states for desktop, laptop, tablet, and narrow web
17. Component/design-system screen showing tokens and component states

## Main map / discovery screen

This is the core screen.

Layout requirements:
- Center: large interactive map.
- Left: library navigation and compact primary filters.
- Bottom or lower panel: track list / candidates, with playback actions.
- Right: Q as a collapsible/contextual panel, not necessarily open by default.
- Persistent audio player that never feels like an afterthought.
- Track drawer can open from map point or row.

Reduce cognitive load:
- Default state should prioritize: search/seed, map, candidate list, now-playing player.
- Q should be collapsed/contextual by default unless a user opens it or selects a track/crate.
- Advanced filters should live behind “More filters” or an expandable sheet.
- Do not show every filter group at equal weight in the default view.
- The drawer and Q panel should not both fight for attention on ordinary laptop widths.

The map must include a persistent trust/explanation layer.

Add a compact “Why this view” strip or panel with:
- visible record count vs full library count
- selected seed track(s)
- active filters
- color-by mode
- similarity definition
- model/analysis version or “analyzed with” note

Sample map trust copy:
“1,284 analyzed records arranged by sonic similarity. Nearby records share audio features like rhythm, texture, brightness, low-end weight, tempo, and key movement. Color is currently showing mood.”

If seed selected:
“Similar to ‘Nocturne Transit’ · 18 candidates · 122 BPM ±4 · compatible keys · warm/percussive filter on.”

If filtered:
“Showing 214 of 1,284 records. Hidden records are outside your BPM, mood, or texture filters.”

Add “How to read this” explanation:
“Distance means sound, not genre. Records closer together share more measured audio traits. Color shows the selected dimension. Cluster names are generated from common traits and can be edited.”

Add map confidence copy:
“This map is a guide for digging, not a verdict. Use preview, BPM, key, and Q’s reason notes before adding tracks to a crate.”

Color mode examples:
- Color by mood
- Color by energy
- Color by key
- Color by cluster
- Color by similarity
- Color by moment

Legend examples:
“Color: Mood — Amber = warm · Blue = dark · Violet = euphoric · Cyan = dubby · Coral = raw · Lime = dreamy”

“Color: Similarity to seed — Brighter points are closer to ‘Nocturne Transit.’ Grey points are outside the strongest match range.”

Distance explanation:
“Map distance: closer records are more alike in sound. The model weighs rhythm, timbre, low-end shape, brightness, tempo, key, and texture. Two tracks can be close even if their genre tags differ.”

Similarity score tooltip:
“Similarity score compares this record to your selected seed. 1.00 means very close. 0.80+ is usually worth auditioning. Scores do not guarantee a clean mix.”

Selected/recommended track reason stack:
- Shared rolling percussion
- 122 BPM vs 120 BPM
- Compatible key: 8A → 9A
- Similar low-mid weight
- Slightly darker vocal texture

Cluster card example:
“Warm Rollers — 187 records · mostly 118–124 BPM · warm, percussive, low-mid focused. Good for warm-up, lounge, and early handover moments.”

Outlier copy:
“This record sits between clusters. It shares tempo with Warm Rollers, but its brighter top end pulls it toward Neon Peak.”

Map failure / fallback states:
- No analyzed tracks yet.
- No results after filters.
- WebGL unavailable or map cannot render.
- Large-library aggregation view for 10k+ tracks.
- Keyboard/list alternative to map selection.

No-results actions:
- Clear all filters
- Widen BPM range
- Include adjacent keys
- Ask Q to loosen search
- Search whole library

## Q assistant

Q should feel like a native DJ workflow, not a generic chat interface.

Q posture:
- Collapsed/contextual by default in the main map screen.
- Opens when invoked, when a track/cluster/crate is selected, or when a user asks a natural-language query.
- On wide desktop it may dock as a sidecar.
- On laptop/tablet it should open as an overlay or drawer.
- On mobile/narrow web it should behave as a focused sheet.

Global Q composer placeholder:
“Ask Q for records, transitions, or crate shape…”

Better composer examples:
- “Find darker options near this”
- “Give me 3 safe transitions”
- “Build a 45-minute warm-up crate”
- “Show overlooked records in this cluster”
- “Lower the energy without losing the groove”

Q empty state:
“Where are we digging tonight? Select a record, lasso a region, or describe the moment. Q will return records and actions, not a chat thread.”

Actions:
- Explain the map
- Find overlooked records
- Start from a vibe
- Open last crate

Track-selected state:
“Q found 18 nearby records. Same low-mid movement, compatible keys, and warm percussion. Three are safer blends; two are better pivots.”

Recommendation card example:
“Low Ceiling — Sordid Palm
0.94 match · 120 BPM · 9A
Same rolling percussion and darker room tone. Safer than it looks: 8A → 9A works cleanly.”

Card actions:
- Preview all
- Reveal on map
- Add selected to crate
- Find darker nearby
- Find safer blends
- Find energy lift
- Hide from this search

Multiple-selection state:
“These 9 records share a dry, clipped kick and minor-key pressure. Six form a peak-time run; three lean tougher and may work better afterhours.”

Crate-in-progress state:
“Two gaps and one ending problem. The crate dips at minute 22, clashes at track 9 → 10, and ends 2 BPM below your handover target.”

Q loading states:
- “Q is listening for nearby records…”
- “Q is checking key flow…”
- “Q is reading this cluster…”
- “Q is shaping the crate…”

Q no-results state:
“Q didn’t find a confident match.”
Show blocking constraints and actions:
- Loosen BPM
- Include adjacent keys
- Remove mood filter
- Search entire library

Q failure state:
“Q couldn’t finish that search. Your library and crate are unchanged. Try again, or narrow by BPM, key, or mood.”

Q privacy boundary:
If cloud Q is used while Mac is in local-only mode, show what context would be sent and offer:
- Use local-only Q
- Allow one-time cloud request
- Cancel

Never imply audio files are silently sent to Q.

## Import / upload flow

Import must feel non-destructive and calm.

Supported files:
- MP3
- WAV
- AIFF
- FLAC
- M4A

Sources:
- Web: files/folders uploaded to private cloud demo storage using direct upload.
- Mac: local folders/files selected through desktop permissions; files stay local by default.
- Optional: Rekordbox XML import.

Required import states:
1. Clean import scan.
2. Duplicate review.
3. Unsupported files.
4. Missing metadata.
5. Web upload failure.
6. Mac folder permission failure.
7. Very large import.

Import trust copy:
“Import is non-destructive. Crate Dig reads your files, builds its own library index, and does not rename, move, delete, or retag originals without explicit permission.”

Duplicate row:
“38 likely duplicates. Same audio fingerprint, different filenames or bitrates. Crate Dig will not delete files. Choose which copy appears in the map.”

Actions:
- Review duplicates
- Use highest quality copy
- Keep both
- Choose manually

Duplicate confirmation:
“Use highest quality copy for 38 duplicate groups? Crate Dig will keep every file on disk. Only the library view will collapse duplicates into one record. You can undo this after import.”

Missing metadata row:
“24 tracks missing artist or title. We can suggest metadata from file names and acoustic fingerprint matches. Nothing is written back to your audio files unless you choose it.”

Actions:
- Review suggestions
- Accept high-confidence only
- Leave blank

Unsupported files:
“6 unsupported files. These files will be skipped for analysis. They will remain in your folder and can be imported later if support is added.”

Web upload failure:
Show failed files with reasons: network interrupted, file too large, unsupported container, storage quota, permission/auth expired.
Actions: Retry failed, remove failed, continue with successful files, save import draft.

Mac permission failure:
“Crate Dig can’t read this folder yet.”
Actions: Grant folder access, choose another folder, open macOS Privacy Settings.

Large import example:
42,812 tracks · 2.1 TB. Show estimated analysis time, cache space needed, analyze in batches, pause/resume, and “analyze metadata first.”

## Analysis progress

Show stages:
- Reading metadata
- Decoding audio
- Extracting BPM / key / loudness
- Generating audio features
- Generating embeddings
- Clustering by similarity
- Creating waveform previews

Required states:
1. Running normally.
2. Partial failure.
3. Stalled analysis.
4. Paused/resumable.
5. Cancel confirmation.
6. Model/pipeline update available.
7. Offline desktop analysis.

Partial failure example:
“1,221 analyzed · 51 warnings · 12 failed.”
Actions:
- Retry failed
- Export error report
- Continue to map with analyzed tracks
- View failed tracks

Stalled analysis example:
“No progress for 8 minutes while decoding audio.”
Actions:
- Keep waiting
- Restart stage
- Skip current file
- Export diagnostics

Pause/cancel copy should say what is preserved. Completed work should never feel lost unless the user explicitly chooses to delete derived artifacts.

## Track list and track row states

Track rows must be compact but readable.

Design both:
- Comfortable row: 44px.
- Compact row: 38px.

Track row text:
- Title: 13px, strong.
- Artist: 12px, readable secondary.
- BPM/key/duration/similarity: 12px, tabular nums.
- Tags: max two visible, overflow as +2.

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

Row requirements:
- Play button, add-to-crate, and overflow menu are independently reachable.
- Selected and playing are visually distinct.
- Long title/artist can wrap in expanded mode and truncate with tooltip/accessibility text in compact table mode.
- Missing metadata appears as “—” with “Edit metadata” or “Analyze again.”

## Track detail drawer

Required states:
- Fully analyzed track.
- Missing artwork/metadata.
- Failed waveform/previews.
- Hidden-from-recommendations.
- Edited tags with unsaved changes.
- Similar tracks empty.
- Long notes/label/remixer field.
- “Ask Q about this” loading/error.

Actions:
- Play
- Add to crate
- Find similar
- Ask Q
- Hide from recommendations
- Edit tags

Make “Edit tags” distinguish Crate Dig library tags from source-file metadata. “Hide from recommendations” should have undo.

## Crates and playlist screen

Design crate-building as set-shaping.

Required states:
1. Normal saved crate.
2. Empty crate.
3. Reordering with undo.
4. Removing tracks with undo.
5. Key clash / energy dip review.
6. Duplicate tracks in crate.
7. Long notes with autosave/error state.

Normal crate should show:
- ordered list
- total runtime
- BPM range
- key compatibility
- energy arc
- notes / set intention
- room / time of day
- handover context

Energy/key issue copy:
“Track 9 → 10 jumps 11A → 8A. Q suggests one bridge record that keeps the warmth.”

Actions:
- Accept
- Ask Q for bridge
- Replace track
- Ignore warning

## Export flow

Export must be a review flow, not a mystery action.

Formats:
- CSV
- M3U playlist
- Rekordbox XML playlist
- Share web preview

Rekordbox warning:
“Rekordbox XML export creates a new playlist file. It does not modify your Rekordbox database. Import the XML inside Rekordbox to review before using it in the booth.”

Before export:
“Export ‘Sunset lounge’ to Rekordbox XML?
14 tracks · 47 min · 112–124 BPM
Crate Dig will include track paths and playlist order. Cue points, beatgrids, hot cues, and My Tags are not included in this MVP export.”

Path warning:
“3 tracks may not resolve in Rekordbox. These files are on an external volume or have moved since import. Review paths before exporting.”

Export success:
“Export ready. ‘Sunset lounge.xml’ was created. Import it from Rekordbox’s XML playlist import flow to review the crate.”

Export failure:
“Export failed. Your crate is unchanged. Crate Dig could not write to that location. Choose another folder or check disk permissions.”

Actions:
- Retry
- Choose different destination
- Reveal in Finder
- Copy path
- Export error report

## Settings / privacy / storage modes

Settings intro:
“Choose where audio, analysis, and crate metadata live. You can change modes later. Crate Dig never uploads local audio from the Mac unless you explicitly enable cloud upload.”

Mode: Local only
“Audio, analysis, embeddings, waveforms, and crates stay on this Mac. Nothing is uploaded. Q uses local library data where available.”

Details:
- Best for: real DJ libraries, external drives, offline work
- Leaves this Mac: nothing
- Works offline: yes
- Storage used: local database + analysis cache

Mode: Cloud demo
“Upload selected audio for browser playback and cloud analysis. Files are private, access-controlled, and deleted after 30 days unless you keep the demo library.”

Details:
- Best for: trying Crate Dig in the browser
- Leaves this Mac: selected audio files, generated previews, analysis features
- Works offline: no
- Delete anytime from Settings → Privacy

Mode: Sync metadata only
“Sync crates, tags, fingerprints, analysis summaries, and map positions between web and Mac. Original audio is not uploaded.”

Details:
- Best for: browsing crates across devices
- Leaves this Mac: metadata, fingerprints, tags, embeddings, crate order
- Leaves this Mac: no original audio
- Playback on web requires cloud demo audio or local Mac access

Switching modes:
Show confirmation before local → cloud mode:
- what will upload
- estimated size
- whether filenames are included
- retention period
- cancel and learn-more actions

Delete cloud library:
“Permanently removes uploaded audio, previews, waveform files, and cloud analysis artifacts. Local Mac files and local crates are not affected.”

## Mac desktop variant

The Mac app should feel like a serious desktop tool, not just a website in a window.

Must show:
- Native-feeling title bar.
- Local folder permissions.
- Offline status.
- Local file playback.
- Local SQLite/library storage indication.
- Analysis engine/model status.
- Settings for analysis model/cache/storage location.
- Keyboard shortcuts.
- Menus/preferences implied.

Offline state:
“Offline · local analysis available.”

Show:
- Local playback works.
- Local analysis works if models are installed.
- Cloud Q/sync/upload unavailable.
- Export to local files works.
- Queued cloud sync actions can be paused/deleted.

Model missing state:
“Deep analysis model not installed.”
Actions:
- Download now
- Use fast local analysis
- Choose model folder

## Responsive behavior

Design real responsive states, not just notes.

Desktop ≥1440:
- Full command center: left rail, map, bottom list, docked Q if open, persistent player.

Laptop 1180–1439:
- Q defaults collapsed.
- Q opens as overlay/drawer.
- Track drawer and Q are mutually exclusive unless very wide.

Tablet 900–1179:
- Filter rail collapses into chip bar + filter sheet.
- Map/list use split view.
- Q as modal side sheet.

Small web 640–899:
- Segmented view: Map / List / Crate.
- Track drawer as bottom sheet.
- Player remains sticky.

Mobile <640:
- Mobile is for auditioning, light crating, and review.
- Import and heavy analysis are desktop/web-large only.
- Provide clear handoff copy: “Open Crate Dig on desktop to import or analyze a full library.”

## Accessibility and semantic requirements

Show focus states and component annotations.

Required:
- Real buttons for actions.
- Real inputs for search/composer.
- Tabs/radio groups where selection is exclusive.
- Checkboxes/toggles for settings.
- Menu buttons for overflow/export.
- Visible focus ring on dark surfaces.
- Tooltip + accessible name for icon-only controls.
- Screen-reader live regions for upload, analysis, Q completion, export, playback, and selection count.
- Non-map equivalent for discovery: keyboardable table/list, cluster summary, and nearest-tracks list.
- Map canvas keyboard behavior:
  - arrow keys pan
  - + / - zoom
  - Esc cancels lasso/selection state
  - command to jump to selected/playing track
  - lasso alternatives: select visible cluster, select filtered results, select nearest 20

Suggested shortcuts:
- / or ⌘F: focus search
- ⌘K: command palette
- Space: play/pause when not typing
- J/K or arrows: move through track rows
- Enter: open focused track detail
- A: add focused/selected track to active crate
- Q: open/focus Q panel
- Esc: close drawer/menu/Q overlay or cancel lasso
- Shift + Arrow: extend row selection
- ⌘Z: undo last reversible crate/import metadata action

## Production stress data to include

Show stress examples:
- Very long track title: “This Is A Very Long Dub Mix Title With Parenthetical Remaster Notes And A Featured Artist”
- Artist with accents/CJK: “Björk / 坂本龍一 / Anaïs Kerr”
- RTL metadata sample.
- Very large library: 42,812 tracks · 2.1 TB.
- Desktop scale target: 10,000 comfortable, 50,000 stretch, 100,000 metadata-row stress.
- Missing BPM/key/genre.
- External drive disconnected.
- Signed playback URL expired.
- Cloud analysis failed for 12 files.
- Export path unavailable.

## Component system deliverables

Create component notes for:
- MapCanvas
- MapTrustBar
- SimilarityReasonStack
- FilterRail
- TrackRow
- TrackDrawer
- QPanel
- CratePanel
- AudioPlayer
- AnalysisRunStatus
- UploadDropzone
- ImportReviewDecision
- ExportSafetyDialog
- StorageModeExplainer
- AuthCard
- LandingHero

For each component, show normal, loading, empty, error, disabled, focus, and long-content states where relevant.

## Final output requirements

Generate polished screens with a cohesive design system and enough detail that an engineer could implement the UI in Next.js/React and later adapt it into an Electron Mac desktop app.

The v2 design should feel like:
late-night studio software + intelligent library map + refined productivity tool.

It should not feel like:
Rekordbox clone, crypto dashboard, generic AI chatbot, analytics dashboard, or decorative sci-fi mockup.
```
