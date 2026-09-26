import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ReadStateProvider} from './contexts/ReadStateContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReadStateProvider>
      <App />
    </ReadStateProvider>
  </StrictMode>,
);
