"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import {
  createSampleSimilarityLab,
  loadEvaluationRound,
  loadSimilarityLab,
  saveSimilarityJudgment,
  type EvaluationAnchor,
  type EvaluationDimension,
  type JudgmentValue,
  type RankedCandidate,
  type SimilarityLabSnapshot,
} from "@/lib/similarity-lab/similarity-lab-api";
import { AnchorRail } from "./AnchorRail";
import { ComparisonBoard } from "./ComparisonBoard";
import { MetricsTable } from "./MetricsTable";
import { PauseIcon, PlayIcon, RefreshIcon } from "./LabIcons";

const DIMENSIONS: { id: EvaluationDimension; label: string }[] = [
  { id: "overall", label: "Overall sound" },
  { id: "drums", label: "Drums" },
  { id: "bass", label: "Bass" },
  { id: "melodic_palette", label: "Melodic palette" },
  { id: "groove", label: "Groove" },
  { id: "production_space", label: "Production space" },
  { id: "mix_compatibility", label: "Mix compatibility" },
];

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—:—";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function LoadingState() {
  return (
    <main className="grid min-h-screen place-items-center bg-ink px-6">
      <div className="w-full max-w-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-amber">Similarity Lab</p>
        <h1 className="mt-3 text-[18px] font-semibold text-paper">Preparing the evaluation set</h1>
        <p className="mt-2 text-[12px] leading-5 text-[var(--ink-tertiary)]">Loading anchors, retrieval configurations, saved judgments, and the latest run report.</p>
        <div className="mt-6 h-[2px] overflow-hidden bg-[var(--hairline)]"><span className="block h-full w-1/3 bg-amber motion-safe:animate-pulse" /></div>
      </div>
    </main>
  );
}

export function SimilarityLab() {
  const [snapshot, setSnapshot] = useState<SimilarityLabSnapshot | null>(null);
  const [activeAnchorId, setActiveAnchorId] = useState("");
  const [selectedConfigurations, setSelectedConfigurations] = useState<string[]>([]);
  const [dimension, setDimension] = useState<EvaluationDimension>("overall");
  const [blind, setBlind] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [roundLoading, setRoundLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let alive = true;
    const forceSample = new URLSearchParams(window.location.search).get("source") === "sample";
    const initialLoad = forceSample
      ? Promise.resolve(createSampleSimilarityLab("Sample data · visual baseline"))
      : loadSimilarityLab().catch((error: unknown) =>
          createSampleSimilarityLab(
            error instanceof Error
              ? `Sample data · ${error.message}`
              : "Sample data · evaluation API unavailable",
          ),
        );
    void initialLoad
      .then((data) => {
        if (!alive) return;
        setSnapshot(data);
        setActiveAnchorId(data.anchors[0]?.id || "");
        setSelectedConfigurations(data.configurations.slice(0, 3).map((item) => item.id));
      });
    return () => { alive = false; };
  }, []);

  const anchor = snapshot?.anchors.find((item) => item.id === activeAnchorId) || snapshot?.anchors[0];
  const configurations = useMemo(() => snapshot?.configurations.filter((item) => selectedConfigurations.includes(item.id)) || [], [snapshot, selectedConfigurations]);
  const rankings = useMemo(() => Object.fromEntries((snapshot?.rankings || []).map((ranking) => [ranking.configurationId, ranking.candidates])), [snapshot]);

  if (!snapshot) return <LoadingState />;
  const data = snapshot;

  function toggleConfiguration(id: string) {
    setSelectedConfigurations((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 3 ? [...current, id] : current);
  }

  async function selectAnchor(nextAnchor: EvaluationAnchor) {
    setActiveAnchorId(nextAnchor.id);
    setPlayingId(null);
    audioRef.current?.pause();
    if (data.source === "sample") return;
    setRoundLoading(true);
    setNotice(null);
    try {
      const round = await loadEvaluationRound(
        data.activeSet.id,
        nextAnchor.track.id,
        selectedConfigurations,
      );
      setSnapshot((current) => current ? { ...current, rankings: round.rankings } : current);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load this anchor");
    } finally {
      setRoundLoading(false);
    }
  }

  async function selectEvaluationSet(evaluationSetId: string) {
    if (evaluationSetId === data.activeSet.id || data.source === "sample") return;
    setRoundLoading(true);
    setNotice(null);
    try {
      const next = await loadSimilarityLab(evaluationSetId);
      setSnapshot(next);
      setActiveAnchorId(next.anchors[0]?.id || "");
      setSelectedConfigurations(next.configurations.slice(0, 3).map((item) => item.id));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load this evaluation set");
    } finally {
      setRoundLoading(false);
    }
  }

  function playTrack(candidate: RankedCandidate) {
    if (!candidate.track.previewUrl) return;
    if (playingId === candidate.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.src = candidate.track.previewUrl;
      void audioRef.current.play();
      setPlayingId(candidate.id);
    }
  }

  function playAnchor() {
    if (!anchor?.track.previewUrl) return;
    if (playingId === anchor.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.src = anchor.track.previewUrl;
      void audioRef.current.play();
      setPlayingId(anchor.id);
    }
  }

  async function judge(configurationId: string, candidate: RankedCandidate, judgment: JudgmentValue) {
    if (!anchor) return;
    const key = `${configurationId}:${candidate.id}`;
    setSavingId(key);
    setNotice(null);
    setSnapshot((current) => current ? { ...current, rankings: current.rankings.map((ranking) => ranking.configurationId === configurationId ? { ...ranking, candidates: ranking.candidates.map((item) => item.id === candidate.id ? { ...item, judgment } : item) } : ranking) } : current);
    try {
      if (data.source === "api") {
        await saveSimilarityJudgment(data.activeSet.id, { anchorTrackId: anchor.track.id, candidateTrackId: candidate.track.id, configurationId, dimension, judgment, rank: candidate.rank, blind });
      }
      setNotice(data.source === "sample" ? "Sample judgment recorded locally — it was not written to the API." : "Judgment saved");
    } catch (error) {
      setSnapshot((current) => current ? { ...current, rankings: current.rankings.map((ranking) => ranking.configurationId === configurationId ? { ...ranking, candidates: ranking.candidates.map((item) => item.id === candidate.id ? { ...item, judgment: candidate.judgment } : item) } : ranking) } : current);
      setNotice(error instanceof Error ? error.message : "Could not save judgment");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="grid h-screen min-h-[620px] grid-rows-[56px_minmax(0,1fr)] overflow-hidden bg-ink text-paper">
      <header className="flex items-center gap-4 border-b border-[var(--hairline)] bg-[var(--panel)] px-4">
        <Wordmark href="/map" size="sm" />
        <span className="h-4 w-px bg-[var(--border)]" aria-hidden />
        <div className="min-w-0">
          <h1 className="text-[13px] font-semibold">Similarity Lab</h1>
          <p className="hidden text-[11px] text-[var(--ink-tertiary)] sm:block">Blind retrieval evaluation</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] sm:inline-flex ${snapshot.source === "api" ? "border-lime/25 bg-lime/5 text-lime" : "border-amber/25 bg-amber/5 text-amber"}`} title={snapshot.sourceMessage}><span className={`h-1.5 w-1.5 rounded-full ${snapshot.source === "api" ? "bg-lime" : "bg-amber"}`} />{snapshot.source === "api" ? "Live data" : "Sample data"}</span>
          <Link href="/map" className="inline-flex h-8 items-center rounded-[8px] border border-[var(--border)] px-3 text-[11.5px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--raised)] hover:text-paper">Back to map</Link>
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[224px_minmax(0,1fr)]">
        <div className="hidden min-h-0 lg:block"><AnchorRail evaluationSet={snapshot.activeSet} evaluationSets={snapshot.evaluationSets} anchors={snapshot.anchors} activeAnchorId={activeAnchorId} loading={roundLoading} onSelect={selectAnchor} onSelectSet={selectEvaluationSet} /></div>
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <section className="shrink-0 border-b border-[var(--hairline)] bg-[var(--app-base)] px-4 py-3.5">
            <div className="mb-3 grid grid-cols-2 gap-2 lg:hidden">
              <label className="min-w-0 text-[11px] text-[var(--ink-tertiary)]">
                <span className="sr-only">Evaluation set</span>
                <select
                  value={snapshot.activeSet.id}
                  disabled={roundLoading || snapshot.evaluationSets.length < 2}
                  onChange={(event) => selectEvaluationSet(event.target.value)}
                  className="h-8 w-full rounded-[7px] border border-[var(--border)] bg-[var(--panel)] px-2 text-paper disabled:opacity-60"
                >
                  {snapshot.evaluationSets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label className="min-w-0 text-[11px] text-[var(--ink-tertiary)]">
                <span className="sr-only">Anchor</span>
                <select
                  value={anchor?.id || ""}
                  onChange={(event) => {
                    const next = snapshot.anchors.find((item) => item.id === event.target.value);
                    if (next) void selectAnchor(next);
                  }}
                  className="h-8 w-full rounded-[7px] border border-[var(--border)] bg-[var(--panel)] px-2 text-paper"
                >
                  {snapshot.anchors.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.judgmentCount}/{item.targetJudgments}</option>)}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
              <div className="flex min-w-[230px] flex-1 items-center gap-3">
                <button type="button" onClick={playAnchor} disabled={!anchor?.track.previewUrl} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber text-ink transition-transform active:scale-95 disabled:cursor-not-allowed disabled:bg-[var(--control)] disabled:text-[var(--ink-faint)]" aria-label={anchor?.track.previewUrl ? `${playingId === anchor?.id ? "Pause" : "Play"} anchor` : "Anchor preview unavailable"}>{playingId === anchor?.id ? <PauseIcon /> : <PlayIcon />}</button>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-amber">Current anchor · {anchor?.label}</p>
                  <h2 className="mt-0.5 truncate text-[15px] font-semibold text-paper">{blind ? "Metadata hidden during judgment" : anchor?.track.title}</h2>
                  <p className="mt-0.5 text-[11.5px] text-[var(--ink-tertiary)]">{blind ? `${formatDuration(anchor?.track.durationSec || null)} · listen for the sound world` : `${anchor?.track.artist} · ${formatDuration(anchor?.track.durationSec || null)}`}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <label className="mr-2 flex items-center gap-2 text-[11.5px] text-[var(--ink-2)]"><input type="checkbox" checked={blind} onChange={(event) => setBlind(event.target.checked)} className="h-3.5 w-3.5 accent-[var(--amber)]" />Blind metadata</label>
                <select value={dimension} onChange={(event) => setDimension(event.target.value as EvaluationDimension)} aria-label="Judgment dimension" className="h-8 rounded-[8px] border border-[var(--border)] bg-[var(--panel)] px-2 text-[11.5px] text-paper"><option disabled>Judgment dimension</option>{DIMENSIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
              </div>
            </div>
          </section>

          <section className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--hairline)] bg-[var(--panel)] px-4 py-2.5" aria-label="Retrieval configurations">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-faint)]">Compare</span>
            {snapshot.configurations.map((configuration) => {
              const active = selectedConfigurations.includes(configuration.id);
              return <button key={configuration.id} type="button" aria-pressed={active} onClick={() => toggleConfiguration(configuration.id)} className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${active ? "border-amber/45 bg-amber/10 text-amber" : "border-[var(--border)] text-[var(--ink-tertiary)] hover:text-paper"}`}>{configuration.name}</button>;
            })}
            <span className="ml-auto text-[11px] text-[var(--ink-faint)]">Choose up to 3</span>
          </section>

          <div className="min-h-0 flex-1 overflow-auto">
            {roundLoading ? <div className="grid min-h-72 place-items-center text-[12px] text-[var(--ink-tertiary)]"><span className="inline-flex items-center gap-2"><RefreshIcon className="h-3.5 w-3.5 motion-safe:animate-spin" />Loading comparison round</span></div> : anchor ? <ComparisonBoard anchor={anchor} configurations={configurations} rankings={rankings} blind={blind} playingId={playingId} savingId={savingId} dimension={dimension} onPlay={playTrack} onJudge={judge} /> : <div className="grid min-h-72 place-items-center px-6 text-center"><div><h2 className="text-[14px] font-semibold text-paper">No anchors yet</h2><p className="mt-1 text-[12px] text-[var(--ink-tertiary)]">Add tracks to this evaluation set before comparing retrieval models.</p></div></div>}
            <MetricsTable configurations={configurations} metrics={snapshot.metrics} />
          </div>

          <footer className="flex min-h-9 shrink-0 items-center border-t border-[var(--hairline)] bg-[var(--panel)] px-4 text-[11px] text-[var(--ink-tertiary)]" role="status" aria-live="polite">
            <span className={notice?.includes("Could not") ? "text-coral" : ""}>{notice || snapshot.sourceMessage}</span>
            <span className="ml-auto hidden sm:inline">Focus a candidate · J fits · K doesn&apos;t · S skips</span>
          </footer>
        </div>
      </div>
      <audio ref={audioRef} onEnded={() => setPlayingId(null)} onError={() => { setPlayingId(null); setNotice("Preview could not be played. Check that the local file is still available."); }} />
    </main>
  );
}
