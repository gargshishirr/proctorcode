import { useAuth } from '../context/AuthContext';

/** Plain-language summary of what proctoring checks and what leaves the device. */
export default function ProctoringConsent({ dark = false }) {
  const { config } = useAuth();
  const head = { fontWeight: 700, fontSize: '0.9rem', margin: '0 0 6px', color: dark ? '#fff' : 'var(--text)' };
  return (
    <div className="stack" style={{ gap: 14, textAlign: 'left' }}>
      <div>
        <p style={head}>What is checked</p>
        <ul className="consent-list">
          <li>Your camera checks that one face is in view and looking at the screen.</li>
          <li>Leaving fullscreen, switching tabs or windows, and copy / paste are recorded.</li>
          <li>Each flag lowers your integrity score. At 0 the test ends.</li>
        </ul>
      </div>
      <div>
        <p style={head}>Your privacy</p>
        <ul className="consent-list">
          <li><strong>Video and images never leave your device.</strong> Face checks run inside your browser.</li>
          <li>The server only stores your code, each flag (for example &ldquo;Looking away&rdquo;) with its time, and your score.</li>
          <li>
            {config.demo
              ? 'This is a public demo: anyone using the demo admin view can see your code and flags. Data resets every few hours.'
              : 'Only the admins of this site can see it. It is kept until an admin deletes it.'}
          </li>
        </ul>
      </div>
    </div>
  );
}
