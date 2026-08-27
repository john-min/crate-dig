# Crate Dig — Claude Design Prompt

## Current design handoff

The original prompt below established the Crate Dig visual/product direction. After reviewing the Claude Design v1 export with Impeccable, the current canonical next-step design handoff is:

- [CLAUDE_DESIGN_V2_PROMPT.md](./CLAUDE_DESIGN_V2_PROMPT.md) — paste-ready prompt for a refined Claude Design v2 output.
- [DESIGN_REFINEMENT_SPEC.md](./DESIGN_REFINEMENT_SPEC.md) — implementation-oriented refinement requirements for engineering/design handoff.
- [.impeccable/critique/2026-08-20T22-48-23Z__crate-dig-deisgn-system-v1-html.md](./.impeccable/critique/2026-08-20T22-48-23Z__crate-dig-deisgn-system-v1-html.md) — critique of the v1 Claude Design export.

The v2 refinement should preserve the dark, nocturnal, music-native direction, Q as a contextual crate-digging assistant, the map/constellation metaphor, and the import/analysis emotional arc. It should improve map explainability, Q actionability, accessibility/semantics, edge states, typography/contrast, responsive layout, and privacy/storage copy. The prototype screen-picker issue is known but intentionally out of scope for the v2 refinement pass.

Use this prompt with Claude Design to generate product screens for Crate Dig.

```txt
You are Claude Design. Design a premium product UI for a music analysis and crate-digging app called “Crate Dig.”

Tagline: “Find the next record.”

The product helps DJs upload or connect their music library, analyze tracks with audio intelligence, cluster songs by vibe/similarity, visualize the library as a map, audition tracks, and build crates/playlists for different moments in a set.

We need designs for both:
1. A responsive web app
2. A Mac desktop app

The app should feel like a refined, modern DJ tool: more minimal and elegant than Rekordbox, less cluttered, more like Linear in restraint and polish. It should be dark, sleek, focused, and fast. It can use color, but color should feel intentional: mood, intensity, cluster identity, sonic texture, not generic neon decoration.

Avoid making this look like a crypto dashboard, generic AI app, or basic analytics dashboard. The core feeling should be: “a beautiful, intelligent command center for finding the next record.”

Reference context:
- Current prototype has a dark UI with a large 2D scatter/map of clustered tracks, a left filter panel, vibe tags, BPM/key filters, seed search, and a track list.
- Rekordbox is powerful but visually dense and technical. Crate Dig should feel calmer, smarter, more spatial, and more opinionated.
- Think: Linear-level polish, DJ-library intelligence, audio-map exploration.

Brand direction:
- Name: Crate Dig
- Tagline: Find the next record.
- AI assistant name: Q
- Tone: refined, focused, nocturnal, tactile, intelligent
- Personality: trusted crate-digging companion, not flashy AI toy
- Visual metaphor: map, constellation, record bag, listening room, signal, spectrum, set arc
- Typography: modern, editorial, precise; avoid generic default SaaS feel
- Color: dark graphite/ink base with restrained sonic accents such as amber, violet, cyan, coral, lime, or blue, used to encode musical meaning
- UI density: professional but breathable
- Motion: subtle, smooth, fast; no bouncy gimmicks

AI assistant / Q:
- The assistant is called “Q.”
- “Q” refers subtly to both a DJ cue button and the idea of a clever technical aide.
- Do not make the interface spy-themed. No James Bond parody, gadgets, missions, or heavy espionage language.
- Q should feel like a quiet, knowledgeable crate-digging companion.
- Q should live as a right-side panel or collapsible sidecar.
- Q should understand the user’s current selection, filters, active crate, and playback context.
- Q is not a generic chatbot. It should return actionable music-discovery cards, track groups, explanations, and next moves.

Example Q prompts:
- “Find me warm, percussive tracks around 122 BPM.”
- “What sounds similar to this track but darker?”
- “Build a 45-minute sunset lounge crate.”
- “Give me three transition options out of this song.”
- “Show me overlooked tracks in this cluster.”
- “What would work after this if I want to raise energy?”

Example Q UI language:
- “Ask Q”
- “Q found 18 nearby records”
- “Q is listening for similar tracks”
- “Q can help shape this into a warm-up crate”
- “Show these on the map”
- “Add all to crate”
- “Find darker”
- “More percussive”
- “Lower energy”

Key users:
- DJs with large local music libraries
- Electronic music collectors
- People building playlists/crates for parties, lounges, radio shows, warm-up sets, late-night sets, etc.
- Users care about BPM, key, energy, mood, texture, similarity, sequencing, and auditioning tracks quickly.

Core product jobs:
- Upload/import a music library
- Analyze tracks
- See clustered music visually
- Search by text or natural language
- Find tracks similar to a seed track
- Filter by vibe, BPM, key, genre, mood, energy, texture
- Play/audition tracks
- Save discovered tracks into crates/playlists
- Ask Q for help building sets or finding transitions

Design the following screens:

1. Landing page
- Purpose: explain Crate Dig and drive sign-up.
- Hero should make the concept instantly clear: upload your library, analyze it, explore your music visually.
- Include the tagline: “Find the next record.”
- Include a beautiful abstract music-map visual.
- Include a short product demo section showing:
  - Upload
  - Analyze
  - Explore clusters
  - Ask Q
  - Build crate
- Include audience-specific language for DJs.
- CTA: “Start digging” or “Analyze your library.”
- Include subtle Mac app/web app positioning: “Use it in the browser. Take it offline on Mac.”

2. Login / sign-up
- Support Google SSO and email/password.
- Dark, minimal, trustworthy.
- Not too much copy.
- Include “Continue with Google,” email, password, forgot password, and create account flow.
- Include small reassurance copy about local files/privacy.

3. Import / upload flow
- Users can upload music files or folders.
- Support drag-and-drop.
- Show accepted formats: MP3, WAV, AIFF, FLAC, M4A.
- For web: upload to cloud storage for demo analysis.
- For Mac desktop: select a local music folder and keep files local.
- Include optional Rekordbox XML import / playlist import.
- Show a “library scan” state with detected tracks, duplicate warnings, unsupported files, missing metadata.
- Make this feel calm and controlled, not like a giant file uploader.

4. Analysis progress screen
- After upload/import, tracks need to be analyzed before appearing in the map.
- Show progress by stage:
  - Reading metadata
  - Decoding audio
  - Extracting BPM/key/loudness
  - Generating embeddings
  - Clustering by similarity
  - Creating waveform/previews
- Show estimated time, tracks completed, errors/warnings.
- Include a tasteful animated visualization: points beginning to form a map, or a spectral scan line.
- Include empty/loading copy that feels polished.
- Include “You can leave this page; we’ll notify you when analysis is done” for web.
- For desktop, include “Analysis runs locally and can continue offline.”

5. Main library map / discovery screen
This is the core screen.

Layout:
- Left sidebar: library filters and crate controls
- Center: large interactive cluster/map visualization
- Bottom or lower panel: track list / candidates
- Right side: Q assistant panel, collapsible
- Persistent audio player somewhere elegant, not an afterthought

Core elements:
- Large scatter/cluster map of tracks
- Points colored by selected dimension: energy, mood, genre, key, moment, cluster, or similarity
- Hover/click point reveals track title, artist, BPM, key, vibe tags, small waveform
- Lasso/select region on map
- Search bar: “Search tracks, artists, labels, or describe a vibe…”
- Seed track search: select one or more tracks and find similar
- Filter chips:
  - Energy: low, medium, peak, driving
  - Mood: warm, euphoric, dark, dreamy, hypnotic
  - Texture: raw, atmospheric, minimal, percussive, vocal
  - BPM range
  - Key / Camelot key
  - Genre
  - Label
  - Date added
- Track list with:
  - play button
  - title
  - artist
  - BPM
  - key
  - genre
  - vibe tags
  - similarity score
  - add to crate
  - more actions
- Crate builder:
  - “Sunset lounge”
  - “Warm-up”
  - “Peak-time”
  - “Afterhours”
  - “Similar to selected”
- The design should make the map understandable. Add labels, legends, and explanation without clutter.

6. Track detail / similarity drawer
- Opens when a user clicks a track.
- Shows metadata, waveform, tags, BPM/key, energy curve, similar tracks, neighboring cluster, and “works well with.”
- Include actions:
  - Play
  - Add to crate
  - Find similar
  - Ask Q
  - Hide from recommendations
  - Edit tags
- Make this feel like inspecting a record, not a database row.

7. Q assistant panel
- Right-side chat/action panel.
- It should understand the current selection/context.
- Include example states:
  - No track selected
  - Track selected
  - Multiple tracks selected
  - Crate in progress
- Q can return:
  - Track recommendations
  - Mini crates
  - Transition suggestions
  - Cluster explanations
  - “Why this matches” reasoning
- Avoid generic chatbot bubbles if possible. Make responses feel like actionable DJ cards.
- Include buttons like:
  - Preview all
  - Add these to crate
  - Show on map
  - Explain this cluster
  - Find darker
  - More percussive
  - Lower energy

8. Saved crate / playlist screen
- User can save a crate of tracks.
- Show ordering, total runtime, BPM range, energy arc, key compatibility hints.
- Include export options:
  - Export CSV
  - Export playlist
  - Export Rekordbox-compatible file placeholder
  - Share web preview
- Include notes field: “Set intention,” “Room,” “Time of day,” etc.

9. Mac desktop app variant
Design a desktop-specific version of the main app.
- Native-feeling title bar
- Local library folder permissions
- Offline analysis status
- Local file playback
- Settings for analysis model/storage location
- Left sidebar with library sections:
  - Library
  - Map
  - Crates
  - Imports
  - Analysis runs
  - Settings
- It should feel like a serious Mac app, not just a website in a window.
- Still visually aligned with the web app.

10. Settings / privacy screen
- Storage options:
  - Local only
  - Cloud demo mode
  - Sync metadata only
- Analysis options:
  - Fast analysis
  - Deep analysis
  - Re-analyze library
  - Model/version info
- Privacy language:
  - “Your music files stay local on Mac unless you choose cloud upload.”
  - “Cloud demo uploads are private.”
- Account settings and logout.

Important UX principles:
- The app should not overwhelm users with every filter immediately.
- Start with simple high-level controls, then reveal advanced controls.
- Make the analysis process feel trustworthy.
- Make the map feel explainable and usable, not decorative.
- Make playback central.
- Make saving into crates obvious.
- Make natural-language exploration with Q feel native to the workflow.
- Organize product language around moments and intent, not just genres.
- The core user question is: “What should I play next?”

Visual style:
- Dark base, but not pure black.
- Soft contrast, sharp typography, elegant spacing.
- Avoid too many bordered cards.
- Avoid generic neon SaaS gradients.
- Use color as musical information.
- Make the app feel like late-night studio software crossed with a beautifully designed productivity app.
- Use subtle waveform/spectrum/constellation motifs.
- Linear-inspired restraint, but warmer and more music-native.

Deliverables:
- High-fidelity screens for web and Mac desktop.
- Include realistic sample data using artists/tracks/vibes, but do not rely on real album art unless using placeholders.
- Show both empty/loading states and populated states.
- Include responsive considerations.
- Include clear component naming/design system notes:
  - Map canvas
  - Filter rail
  - Track row
  - Track drawer
  - Crate panel
  - Q panel
  - Audio player
  - Analysis run status
  - Upload dropzone
  - Auth card
  - Landing hero

Please generate polished screens with a cohesive design system and enough detail that an engineer could implement the UI in Next.js/React and later adapt it into an Electron or Tauri Mac desktop app.
```
