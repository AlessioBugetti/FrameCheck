import { useCallback, useEffect, useRef, useState } from 'react'
import FindingsPanel from './FindingsPanel'
import Timeline from './Timeline'
import VideoWorkspace from './VideoWorkspace'
import { contextStart, findingLabels, formatTime } from './review'
import type { Config, Finding, FindingType, Job, Playback } from './review'

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error?.message || `The local server returned an error (${response.status}).`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function FrameMark() {
  return <svg viewBox="0 0 28 28" aria-hidden="true" fill="none"><path d="M9 3H3v6M19 3h6v6M25 19v6h-6M9 25H3v-6" stroke="currentColor" strokeWidth="2" /><path d="m10 14 3 3 6-7" stroke="currentColor" strokeWidth="2" /></svg>
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploadName, setUploadName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pollError, setPollError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [route, setRoute] = useState<'original' | 'preview' | null>(null)
  const [playback, setPlayback] = useState<Playback>({ status: 'checking', source: null, error: null })
  const fileInput = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const generation = useRef(0)
  const requestedPreview = useRef(false)
  const jobId = job?.job_id

  const loadConfig = useCallback(async () => {
    try {
      setConfig(await api<Config>('/api/config'))
      setError(null)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not connect to the local server.')
    }
  }, [])

  useEffect(() => { void loadConfig() }, [loadConfig])

  useEffect(() => {
    if (!jobId || (job.analysis.status !== 'validating' && job.analysis.status !== 'running' && job.preview.status !== 'running')) return
    let active = true
    let timer = 0
    const poll = async () => {
      try {
        const next = await api<Job>(`/api/jobs/${jobId}`)
        if (!active) return
        setJob(next)
        setPollError(null)
        timer = window.setTimeout(poll, 750)
      } catch (failure) {
        if (active) setPollError(failure instanceof Error ? failure.message : 'Could not check processing progress.')
      }
    }
    void poll()
    return () => { active = false; window.clearTimeout(timer) }
  }, [jobId, job?.analysis.status, job?.preview.status, retry])

  const requestPreview = useCallback(async () => {
    if (!jobId || requestedPreview.current) return
    requestedPreview.current = true
    const currentGeneration = generation.current
    setRoute(null)
    setPlayback({ status: 'preparing', source: 'preview', error: null })
    try {
      const next = await api<Job>(`/api/jobs/${jobId}/preview`, { method: 'POST' })
      if (currentGeneration === generation.current) setJob(next)
    } catch (failure) {
      if (currentGeneration === generation.current) setPlayback({ status: 'unavailable', source: 'preview', error: failure instanceof Error ? failure.message : 'Could not prepare a compatible preview.' })
    }
  }, [jobId])

  useEffect(() => {
    if (job?.analysis.status !== 'complete' || !job.media) return
    if (job.preview.status === 'failed') {
      setRoute(null)
      setPlayback({ status: 'unavailable', source: 'preview', error: job.preview.error?.message || 'Preview preparation failed.' })
    } else if (job.preview.status === 'complete') {
      setRoute('preview')
      setPlayback({ status: 'checking', source: 'preview', error: null })
    } else if (job.media.requires_preview) {
      void requestPreview()
    } else if (!requestedPreview.current) {
      setRoute('original')
      setPlayback({ status: 'checking', source: 'original', error: null })
    }
  }, [job?.analysis.status, job?.preview.status, job?.media?.requires_preview, requestPreview])

  const onReady = useCallback((source: 'original' | 'preview') => {
    setPlayback({ status: 'ready', source, error: null })
  }, [])

  const onFailure = useCallback((source: 'original' | 'preview', message: string) => {
    if (source === 'original') void requestPreview()
    else {
      setRoute(null)
      setPlayback({ status: 'unavailable', source, error: message })
    }
  }, [requestPreview])

  async function start(file?: File) {
    if (busy || !config?.tools.ready) return
    if (file && file.size > config.limits.max_bytes) {
      setError(`This video exceeds the ${config.limits.max_bytes / 1_000_000} MB limit. Choose a smaller file.`)
      return
    }
    setBusy(true)
    setUploadName(file?.name || 'Synthetic demo')
    setError(null)
    const currentGeneration = ++generation.current
    requestedPreview.current = false
    setRoute(null)
    setSelectedId(null)
    setCurrentTime(0)
    setPlayback({ status: 'checking', source: null, error: null })
    try {
      const next = await api<Job>(file ? `/api/jobs?filename=${encodeURIComponent(file.name)}` : '/api/demo', { method: 'POST', body: file, headers: file ? { 'Content-Type': 'application/octet-stream' } : undefined })
      if (currentGeneration === generation.current) setJob(next)
    } catch (failure) {
      if (currentGeneration === generation.current) {
        await loadConfig()
        setError(failure instanceof Error ? failure.message : 'Could not load this video.')
      }
    } finally {
      if (currentGeneration === generation.current) setBusy(false)
    }
  }

  async function reset(id: string) {
    setBusy(true)
    setError(null)
    try {
      await api<void>(`/api/jobs/${id}`, { method: 'DELETE' })
      generation.current += 1
      requestedPreview.current = false
      setJob(null)
      setRoute(null)
      setSelectedId(null)
      setCurrentTime(0)
      setPollError(null)
      await loadConfig()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not reset the current job.')
    } finally { setBusy(false) }
  }

  function selectFinding(finding: Finding) {
    setSelectedId(finding.id)
    if (playback.status === 'ready' && videoRef.current) {
      videoRef.current.pause()
      const position = contextStart(finding)
      videoRef.current.currentTime = position
      setCurrentTime(position)
    }
  }

  const complete = job?.analysis.status === 'complete'
  const waitingJob = !job ? config?.current_job : null
  const sourceUrl = route ? job?.media_urls[route] || null : null

  return <div className="app-shell">
    <header className="app-header">
      <a className="brand" href="/" aria-label="FrameCheck home"><FrameMark /><span>FrameCheck</span></a>
      <span className="header-divider" />
      <span className="header-caption">Video review workspace</span>
      <span className="local-label"><span aria-hidden="true">●</span> Local processing</span>
    </header>
    <main>
      {error && <div className="notice" role="alert"><strong>Something needs attention</strong><p>{error}</p>{!config && <button type="button" onClick={() => void loadConfig()}>Retry connection</button>}</div>}
      {pollError && <div className="notice" role="alert"><p>{pollError}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Retry connection</button></div>}
      {!job && !busy && <section className="welcome">
        <div className="welcome-copy"><div className="eyebrow">Before you deliver</div><h1>Give every frame<br />a final look.</h1><p>Locate suspicious black frames, frozen frames, and silence. Watch each moment in context before you hand over the video.</p></div>
        <div className="intake panel">
          <div className="intake-symbol"><FrameMark /></div>
          <h2>Start a video review</h2>
          <p>Your video stays on this computer.</p>
          {waitingJob ? <div className="existing-job"><strong>A previous job is still here</strong><p className="filename">{waitingJob.filename}</p><p>Reset it to start a new review. Previous review decisions are not saved.</p><button className="primary" type="button" onClick={() => void reset(waitingJob.job_id)}>Reset current job</button></div> : <>
            <div className="intake-actions"><button className="primary" type="button" disabled={!config?.tools.ready} onClick={() => fileInput.current?.click()}><span aria-hidden="true">↑</span> Upload video</button><button type="button" disabled={!config?.tools.ready} onClick={() => void start()}><span aria-hidden="true">▷</span> Try the demo</button></div>
            <p className="limits">MP4, MOV, MKV, WebM <span>·</span> Up to {config ? config.limits.max_duration / 60 : 5} minutes <span>·</span> {config ? config.limits.max_bytes / 1_000_000 : 500} MB</p>
            <p className="demo-caption">The synthetic demo includes known intervals to explore.</p>
          </>}
          {!config && !error && <p role="status">Connecting to the local processor…</p>}
          {config && !config.tools.ready && <div className="notice" role="alert">{config.tools.error || 'The local media tools are not ready.'}</div>}
          <input ref={fileInput} className="hidden-input" type="file" accept=".mp4,.mov,.mkv,.webm" aria-label="Choose video file" tabIndex={-1} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void start(file) }} />
        </div>
        <div className="trust-notes"><div><span className="note-number">01</span><h3>Check the original</h3><p>Local analysis looks for three types of suspicious intervals.</p></div><div><span className="note-number">02</span><h3>Watch in context</h3><p>Jump just before a finding to understand what happened.</p></div><div><span className="note-number">03</span><h3>Keep your judgment</h3><p>A static scene or a quiet moment can be intentional.</p></div></div>
        {config && <details className="support-details"><summary>Supported video and audio combinations</summary><table><thead><tr><th>Container</th><th>Video</th><th>Audio</th></tr></thead><tbody>{config.supported.map((row, index) => <tr key={index}><td>{row.container}</td><td>{row.video}</td><td>{row.audio}</td></tr>)}</tbody></table><p>No audio track is also supported. One video stream and at most one audio stream per file.</p></details>}
      </section>}
      {busy && !job && <section className="processing panel" role="status"><div className="eyebrow">Video intake</div><h1>{waitingJob ? 'Resetting current job' : 'Loading your video'}</h1><p className="filename">{uploadName || waitingJob?.filename}</p><div className="indeterminate-line" /><p>The file is being prepared on this computer.</p></section>}
      {job && <>
        <div className="review-header"><div className="file-heading"><div className="eyebrow">{complete ? 'Review workspace' : 'Video analysis'}</div><h1 title={job.filename}>{job.filename}</h1></div><div className="review-header-actions">{complete && <span className="review-progress"><strong>0</strong> of {job.findings.length} reviewed</span>}<button type="button" disabled={busy} onClick={() => void reset(job.job_id)}>{complete || job.analysis.status === 'failed' ? 'New video' : 'Cancel analysis'}</button></div></div>
        {!complete && <section className="processing panel" role={job.analysis.status === 'failed' ? 'alert' : 'status'}>
          <div className="eyebrow">Original video</div><h2>{job.analysis.status === 'failed' ? 'Analysis could not finish' : job.analysis.status === 'validating' ? 'Checking video compatibility' : 'Analyzing suspicious intervals'}</h2>
          <p>{job.analysis.status === 'failed' ? job.analysis.error?.message || 'The video could not be analyzed.' : job.analysis.status === 'validating' ? 'Checking the format, tracks, and duration before analysis.' : 'Checking black frames, frozen frames, and silence.'}</p>
          {job.analysis.status === 'running' && job.analysis.progress !== null ? <div className="progress-meter"><progress value={job.analysis.progress} max={1} aria-label="Analysis progress" /><span className="tabular">{Math.floor(job.analysis.progress * 100)}%</span></div> : job.analysis.status !== 'failed' && <div className="indeterminate-line" />}
          <p className="small-text">The original file is preserved. Findings will need human review.</p>
        </section>}
        {complete && job.media && <>
          <div className="review-meta"><span>{job.media.width} × {job.media.height}</span><span>{formatTime(job.media.duration)}</span><span>{job.media.container.toUpperCase()} · {job.media.video_codec.toUpperCase()}</span>{!job.media.has_audio && <span className="audio-note">No audio track</span>}<span className="finding-summary">{(Object.keys(findingLabels) as FindingType[]).map((type) => <span key={type}>{findingLabels[type]} <strong>{job.findings.filter((finding) => finding.type === type).length}</strong></span>)}</span></div>
          {job.preview.status === 'running' && <div className="preview-progress" role="status"><span>Preparing compatible preview</span>{job.preview.progress !== null && <><progress value={job.preview.progress} max={1} aria-label="Preview preparation progress" /><span className="tabular">{Math.floor(job.preview.progress * 100)}%</span></>}</div>}
          <div className="workspace-grid"><div className="player-column"><VideoWorkspace videoRef={videoRef} sourceUrl={sourceUrl} source={route} playback={playback} duration={job.media.duration} currentTime={currentTime} onTimeChange={setCurrentTime} onReady={onReady} onFailure={onFailure} /><Timeline findings={job.findings} duration={job.media.duration} currentTime={currentTime} selectedId={selectedId} playable={playback.status === 'ready'} onSelect={selectFinding} /><p className="review-guidance">Findings are candidates, not confirmed defects. Select a finding to pause and seek one second before it starts.</p>{job.media.ignored_streams.length > 0 && <p className="review-guidance">Not analyzed: {job.media.ignored_streams.join(', ')}.</p>}</div><FindingsPanel findings={job.findings} selectedId={selectedId} onSelect={selectFinding} /></div>
        </>}
      </>}
    </main>
    <footer className="app-footer"><span>FrameCheck</span><span>Local analysis. Human judgment.</span></footer>
  </div>
}
