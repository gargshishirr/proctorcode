import { useEffect, useRef, useState } from 'react';
import * as faceapi from '@vladmandic/face-api';
import Icon from './Icon';

const MODEL_URL = '/models';
const DETECT_INTERVAL = 1100; // ms between detections
const AWAY_FRAMES = 3; // consecutive bad frames before flagging gaze
const NOFACE_FRAMES = 3;
const COOLDOWN = 5000; // ms minimum between same-type camera violations

let modelsPromise = null;
function loadModels() {
  if (!modelsPromise) {
    modelsPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    ]);
  }
  return modelsPromise;
}

const mean = (pts, axis) => pts.reduce((s, p) => s + p[axis], 0) / pts.length;

export default function WebcamProctor({ active, onViolation, onStatusChange }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const counters = useRef({ away: 0, noface: 0, multi: 0 });
  const lastViolation = useRef({});
  const [status, setStatus] = useState('loading'); // loading | ok | no_face | multiple | away | no_camera | error

  const setBoth = (s) => {
    setStatus(s);
    onStatusChange?.(s);
  };

  const fire = (type, severity, details) => {
    const now = Date.now();
    if (lastViolation.current[type] && now - lastViolation.current[type] < COOLDOWN) return;
    lastViolation.current[type] = now;
    onViolation?.(type, severity, details);
  };

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function start() {
      try {
        setBoth('loading');
        await loadModels();
        if (cancelled) return;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: 'user' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setBoth('ok');
        timerRef.current = setInterval(detect, DETECT_INTERVAL);
      } catch (err) {
        if (cancelled) return;
        const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
        setBoth(denied ? 'no_camera' : 'error');
        fire('camera_blocked', 'high', denied ? 'Camera access denied' : 'Camera unavailable');
      }
    }

    async function detect() {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      let results;
      try {
        results = await faceapi
          .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
          .withFaceLandmarks();
      } catch {
        return;
      }
      if (cancelled) return;

      const faces = results.length;

      // No face present
      if (faces === 0) {
        counters.current.noface += 1;
        counters.current.away = 0;
        counters.current.multi = 0;
        if (counters.current.noface >= NOFACE_FRAMES) {
          setBoth('no_face');
          fire('no_face', 'high', 'No face detected in frame');
        }
        return;
      }
      counters.current.noface = 0;

      // Multiple people
      if (faces > 1) {
        counters.current.multi += 1;
        counters.current.away = 0;
        setBoth('multiple');
        fire('multiple_faces', 'high', `${faces} faces detected in frame`);
        return;
      }
      counters.current.multi = 0;

      // Single face -> estimate gaze / head orientation
      const { landmarks, detection } = results[0];
      const leftEye = landmarks.getLeftEye().map((p) => [p.x, p.y]);
      const rightEye = landmarks.getRightEye().map((p) => [p.x, p.y]);
      const nose = landmarks.getNose().map((p) => [p.x, p.y]);

      const leftEyeX = mean(leftEye, 0);
      const rightEyeX = mean(rightEye, 0);
      const noseTip = nose[Math.min(6, nose.length - 1)];
      const eyeSpan = rightEyeX - leftEyeX || 1;
      const yaw = (noseTip[0] - leftEyeX) / eyeSpan; // ~0.5 looking straight

      const box = detection.box;
      const faceCenterX = box.x + box.width / 2;
      const faceCenterY = box.y + box.height / 2;
      const offX = (faceCenterX - video.videoWidth / 2) / video.videoWidth;
      const offY = (faceCenterY - video.videoHeight / 2) / video.videoHeight;

      const turned = yaw < 0.34 || yaw > 0.66;
      const offCenter = Math.abs(offX) > 0.22 || offY > 0.26;

      if (turned || offCenter) {
        counters.current.away += 1;
        if (counters.current.away >= AWAY_FRAMES) {
          setBoth('away');
          const dir = yaw < 0.34 ? 'left' : yaw > 0.66 ? 'right' : offY > 0.26 ? 'down' : 'away';
          fire('looking_away', 'medium', `Candidate looking ${dir}`);
        }
      } else {
        counters.current.away = 0;
        setBoth('ok');
      }
    }

    start();
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const statusMeta = {
    loading: { chip: 'chip-gray', label: 'Initializing AI…' },
    ok: { chip: 'chip-gray', label: 'Monitoring' },
    no_face: { chip: 'chip-red', label: 'No face detected' },
    multiple: { chip: 'chip-red', label: 'Multiple faces!' },
    away: { chip: 'chip-amber', label: 'Look at the screen' },
    no_camera: { chip: 'chip-red', label: 'Camera blocked' },
    error: { chip: 'chip-red', label: 'Camera error' },
  }[status] || { chip: 'chip-gray', label: 'Monitoring' };

  return (
    <div>
      <div className="webcam-box">
        <video ref={videoRef} muted playsInline />
        <div className="webcam-status">
          <span className="rec-dot" />
          AI PROCTOR
        </div>
        {(status === 'no_camera' || status === 'error' || status === 'loading') && (
          <div
            style={{
              position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
              background: 'rgba(0,0,0,0.7)', color: '#cdd2e1', fontSize: '0.8rem', textAlign: 'center', padding: 12,
            }}
          >
            {status === 'loading' ? (
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <span className="spinner" /> Loading AI models…
              </span>
            ) : (
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <Icon name="camera" size={22} />
                {status === 'no_camera' ? 'Camera access denied' : 'Camera unavailable'}
              </span>
            )}
          </div>
        )}
      </div>
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#9aa0b4' }}>
          <Icon name="eye" size={14} /> Gaze &amp; face tracking
        </span>
        <span className={`chip ${statusMeta.chip}`}>{statusMeta.label}</span>
      </div>
    </div>
  );
}
