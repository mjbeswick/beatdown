import { memo, useEffect, useRef } from 'react';
import AudioMotionAnalyzer from 'audiomotion-analyzer';
import { getAnalyserNode, getAudioContext, onAudioReady } from '../audio/engine';
import type { NowPlayingSpectrumStyle } from '../stores/appSettings';

interface SpectrumAnalyzerProps {
  style: NowPlayingSpectrumStyle;
}

function SpectrumAnalyzer({ style }: SpectrumAnalyzerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const analyzerRef = useRef<AudioMotionAnalyzer | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const initializeAnalyzer = (audioCtx: AudioContext, sourceNode: AnalyserNode) => {
      if (analyzerRef.current || !containerRef.current) return;

      try {
        const styleOptions =
          style === 'dense'
            ? {
                mode: 10,
                barSpace: 0,
                gradient: 'emerald' as const,
                mirror: 0 as const,
                fillAlpha: 0.38,
                lineWidth: 1,
                showPeaks: false,
              }
            : {
                mode: 3,
                barSpace: 0.1,
                gradient: 'rainbow' as const,
                mirror: 0 as const,
              };

        const analyzer = new AudioMotionAnalyzer(container, {
          audioCtx,
          connectSpeakers: false, // Don't output audio, just visualize
          loRes: true,

          ...styleOptions,

          // Frame rate cap — canvas drawing runs on the main thread; uncapped it
          // competes with React rendering and kills UI responsiveness.
          maxFPS: 24,

          // Audio analysis
          fftSize: 8192,
          smoothing: 0.7,
          minFreq: 20,
          maxFreq: 12000,
          minDecibels: -85,
          maxDecibels: -35,
          frequencyScale: 'log',
          weightingFilter: 'D',

          // Amplitude
          linearAmplitude: true,
          linearBoost: 1.0,

          // Colors
          colorMode: 'gradient',
          channelLayout: 'single',
          alphaBars: true,

          // Background
          overlay: true,
          bgAlpha: 0,
          showBgColor: false,

          // Reflex / Mirror
          reflexFit: true,
          reflexRatio: 0,
          reflexAlpha: 1,
          reflexBright: 1,

          // Minimal UI
          showFPS: false,
          showPeaks: true,
          showScaleX: false,
          showScaleY: false,


        });

        // Register custom emerald gradient — matches the seek bar color
        analyzer.registerGradient('emerald', {
          bgColor: '#000',
          colorStops: ['#6ee7b7', '#10b981'],
        });


        // Connect AudioMotion to the audio engine's analyser node
        try {
          analyzer.connectInput(sourceNode);
        } catch (e) {
          console.warn('SpectrumAnalyzer: could not connect to source node:', e);
        }

        analyzerRef.current = analyzer;
        analyzer.start();
      } catch (error) {
        console.error('SpectrumAnalyzer: Failed to initialize AudioMotion:', error);
      }
    };

    // Initialize immediately when audio is already available.
    const audioCtx = getAudioContext();
    const sourceNode = getAnalyserNode();
    if (audioCtx && sourceNode) {
      initializeAnalyzer(audioCtx, sourceNode);
    }

    // Fallback to event-driven initialization when engine is not ready yet.
    const unsubscribeAudioReady = onAudioReady((readyCtx, readyAnalyser) => {
      initializeAnalyzer(readyCtx, readyAnalyser);
    });

    // Cleanup
    return () => {
      unsubscribeAudioReady();
      if (analyzerRef.current) {
        try {
          analyzerRef.current.stop();
          analyzerRef.current.destroy();
        } catch (e) {
          console.warn('SpectrumAnalyzer: Error cleaning up analyzer:', e);
        }
        analyzerRef.current = null;
      }
    };
  }, [style]);

  // Handle window resize
  useEffect(() => {
    let resizeTimeout: ReturnType<typeof setTimeout>;

    const handleResize = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (analyzerRef.current && containerRef.current) {
          analyzerRef.current.setCanvasSize(
            containerRef.current.clientWidth,
            containerRef.current.clientHeight
          );
        }
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimeout) clearTimeout(resizeTimeout);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full shrink-0"
      style={{
        height: 'clamp(8rem, 15vmin, 14rem)',
        contain: 'layout paint size',
      }}
    />
  );
}

export default memo(SpectrumAnalyzer);
