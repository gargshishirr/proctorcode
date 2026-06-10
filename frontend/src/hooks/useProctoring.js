import { useEffect, useRef } from 'react';

/**
 * Behavioural proctoring: detects tab switching, window/monitor switching,
 * copy / cut / paste, right-click, dev-tools, print, and fullscreen exit.
 *
 * @param {boolean} active   when true, listeners are attached
 * @param {(type, severity, details) => void} onViolation
 */
export default function useProctoring(active, onViolation) {
  const cbRef = useRef(onViolation);
  cbRef.current = onViolation;

  // throttle duplicate events of the same type firing in quick succession
  const lastFired = useRef({});

  useEffect(() => {
    if (!active) return;

    const report = (type, severity, details) => {
      const now = Date.now();
      if (lastFired.current[type] && now - lastFired.current[type] < 800) return;
      lastFired.current[type] = now;
      cbRef.current?.(type, severity, details);
    };

    const onVisibility = () => {
      if (document.hidden) {
        report('tab_switch', 'high', 'Switched away from the test tab');
      }
    };

    const onWindowBlur = () => {
      // Window lost focus but tab still visible -> app / monitor switch.
      if (!document.hidden) {
        report('window_switch', 'medium', 'Application window lost focus');
      }
    };

    const onCopy = () => report('copy', 'medium', 'Copy action detected');
    const onCut = () => report('cut', 'medium', 'Cut action detected');
    const onPaste = () => report('paste', 'high', 'Paste action detected');
    const onContextMenu = (e) => {
      e.preventDefault();
      report('right_click', 'low', 'Right-click / context menu');
    };

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        report('fullscreen_exit', 'high', 'Exited fullscreen mode');
      }
    };

    const onKeyDown = (e) => {
      const k = e.key?.toLowerCase();
      if (e.key === 'F12') {
        report('devtools', 'high', 'Attempted to open developer tools');
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) {
        report('devtools', 'high', 'Attempted to open developer tools');
      }
      if ((e.ctrlKey || e.metaKey) && k === 'p') {
        e.preventDefault();
        report('print', 'medium', 'Attempted to print the page');
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [active]);
}

export function enterFullscreen(el = document.documentElement) {
  if (el.requestFullscreen) return el.requestFullscreen().catch(() => {});
  if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
  return Promise.resolve();
}

export function exitFullscreen() {
  if (document.fullscreenElement && document.exitFullscreen) {
    return document.exitFullscreen().catch(() => {});
  }
  return Promise.resolve();
}
