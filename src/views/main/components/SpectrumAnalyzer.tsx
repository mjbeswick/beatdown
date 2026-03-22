import { useEffect, useRef } from 'react';
import AudioMotionAnalyzer from 'audiomotion-analyzer';
import { getActiveDeck, getAnalyserNode, getAudioContext } from '../audio/engine';

export default function SpectrumAnalyzer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const analyzerRef = useRef<AudioMotionAnalyzer | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      console.warn('SpectrumAnalyzer: container ref not set');
      return;
    }

    console.log('SpectrumAnalyzer: container found, polling for audio...');

    // Poll for audio to be playing
    const pollInterval = setInterval(() => {
      if (analyzerRef.current) {
        console.log('SpectrumAnalyzer: already initialized, stopping poll');
        clearInterval(pollInterval);
        return;
      }

      const deck = getActiveDeck();

      console.log('SpectrumAnalyzer poll:', {
        deckPlaying: deck?.paused === false,
      });

      // Need an active deck that's playing
      if (!deck || deck.paused) {
        return;
      }

      console.log('SpectrumAnalyzer: audio is playing, initializing...');

      // Audio is ready, initialize AudioMotion
      try {
        console.log('Container dimensions:', {
          width: container.clientWidth,
          height: container.clientHeight,
        });

        const analyzer = new AudioMotionAnalyzer(container, {
          // Visualization mode (0 = bars)
          mode: 0,

          // Audio analysis
          fftSize: 2048,
          smoothing: 0.8,

          // Colors
          colorMode: 'gradient',
          gradient: 'rainbow',

          // Enable background so we can see the canvas
          overlay: true,
          bgAlpha: 0.3,
          showBgColor: true,

          // Minimal UI
          showFPS: false,
          showPeaks: false,
          showScaleX: false,
          showScaleY: false,
        });

        console.log('SpectrumAnalyzer: AudioMotion initialized successfully', {
          canvasSize: analyzer.canvas ? `${analyzer.canvas.width}x${analyzer.canvas.height}` : 'no canvas',
        });

        // Connect AudioMotion to the audio deck (the actual audio source)
        try {
          analyzer.connectInput(deck);
          console.log('SpectrumAnalyzer: connected to deck');
        } catch (e) {
          console.warn('SpectrumAnalyzer: could not connect to deck:', e);
        }

        analyzerRef.current = analyzer;

        // Start rendering
        console.log('SpectrumAnalyzer: calling start()');
        analyzer.start();
        console.log('SpectrumAnalyzer: started rendering');

        clearInterval(pollInterval);
      } catch (error) {
        console.error('SpectrumAnalyzer: Failed to initialize AudioMotion:', error);
        clearInterval(pollInterval);
      }
    }, 100); // Poll every 100ms

    console.log('SpectrumAnalyzer: poll interval started');

    // Cleanup
    return () => {
      console.log('SpectrumAnalyzer: cleaning up');
      clearInterval(pollInterval);
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
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (analyzerRef.current && containerRef.current) {
        analyzerRef.current.setCanvasSize(
          containerRef.current.clientWidth,
          containerRef.current.clientHeight
        );
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full shrink-0 bg-white border border-zinc-700"
      style={{
        height: 'clamp(8rem, 15vmin, 14rem)',
        marginTop: 'clamp(1rem, 2vmin, 1.5rem)',
      }}
    />
  );
}
