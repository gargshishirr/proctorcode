// Serve the Monaco editor from our own origin (no CDN), so the CSP can stay 'self'-only.
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from './monaco/editorWorker.js?worker';
import TsWorker from './monaco/tsWorker.js?worker';

self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  },
};

loader.config({ monaco });
