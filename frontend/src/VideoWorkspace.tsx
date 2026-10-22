import { useEffect } from 'react'
import type { RefObject } from 'react'
import { formatTime } from './review'
import type { Playback } from './review'

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>
  sourceUrl: string | null
  source: 'original' | 'preview' | null
  playback: Playback
  duration: number
  currentTime: number
  onTimeChange: (time: number) => void
  onReady: (source: 'original' | 'preview') => void
  onFailure: (source: 'original' | 'preview', message: string) => void
}

export default function VideoWorkspace({ videoRef, sourceUrl, source, playback, duration, currentTime, onTimeChange, onReady, onFailure }: Props) {
  useEffect(() => {
    const video = videoRef.current
    if (!video || !sourceUrl || !source) return
    let active = true
    let frameRequest = 0
    const timeout = window.setTimeout(() => fail('The browser could not display a video frame.'), 10_000)
    const fail = (message: string) => {
      if (!active) return
      active = false
      window.clearTimeout(timeout)
      video.cancelVideoFrameCallback(frameRequest)
      video.pause()
      onFailure(source, message)
    }
    const error = () => fail('The browser could not play this video.')
    const presented = () => {
      if (!active) return
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        window.clearTimeout(timeout)
        onReady(source)
      } else {
        frameRequest = video.requestVideoFrameCallback(presented)
      }
    }
    video.addEventListener('error', error)
    frameRequest = video.requestVideoFrameCallback(presented)
    video.src = sourceUrl
    video.load()
    return () => {
      active = false
      window.clearTimeout(timeout)
      video.cancelVideoFrameCallback(frameRequest)
      video.removeEventListener('error', error)
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [videoRef, sourceUrl, source, onReady, onFailure])

  return <section className="video-panel panel" aria-label="Video player">
    <div className="video-stage">
      <video ref={videoRef} controls={playback.status === 'ready'} preload="auto" playsInline aria-label="Review video" onTimeUpdate={(event) => onTimeChange(event.currentTarget.currentTime)} />
      {playback.status !== 'ready' && <div className="video-overlay" role="status">
        <span className="frame-symbol" aria-hidden="true">▣</span>
        <h2>{playback.status === 'unavailable' ? 'Playback unavailable' : playback.status === 'preparing' ? 'Preparing compatible preview' : 'Checking playback'}</h2>
        <p>{playback.status === 'unavailable' ? playback.error : playback.status === 'preparing' ? 'Creating a local preview. Your original is preserved.' : 'Waiting for the browser to display a video frame.'}</p>
        {playback.status === 'unavailable' && <p className="small-text">Analysis results remain available below and in the findings panel.</p>}
      </div>}
    </div>
    <div className="player-footer"><span><i className={`ready-dot${playback.status === 'ready' ? ' is-ready' : ''}`} />{playback.status === 'ready' ? source === 'preview' ? 'Compatible preview' : 'Original video' : playback.status === 'unavailable' ? 'Playback unavailable' : 'Playback pending'}</span><span className="tabular">{formatTime(currentTime)} <span className="muted">/ {formatTime(duration)}</span></span></div>
  </section>
}
