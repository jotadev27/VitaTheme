import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { appBridge } from './ipc/bridge-client';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/content.css';
import './styles/preview.css';

/**
 * Starting the window.
 *
 * The bridge is resolved once, here, and handed to the interface: a component never reaches
 * for a global to talk to the rest of the application. The platform is recorded on the
 * document before anything is drawn, because the toolbar has to leave room for the window
 * controls macOS draws over it.
 */

const container = document.getElementById('root');
if (container === null) {
  throw new Error('The application window has no mounting point.');
}

const root = createRoot(container);

try {
  const bridge = appBridge();
  const description = await bridge.describeApp();

  document.documentElement.dataset.platform = description.platform;
  document.title = description.name;

  root.render(
    <StrictMode>
      <App bridge={bridge} />
    </StrictMode>,
  );
} catch (error) {
  // Without the bridge there is no application, only a page. Say so, rather than showing an
  // interface whose every control would fail.
  root.render(
    <div className="welcome">
      <div className="welcome-intro">
        <h1>VitaTheme could not start</h1>
        <p className="muted">{error instanceof Error ? error.message : String(error)}</p>
      </div>
    </div>,
  );
}
