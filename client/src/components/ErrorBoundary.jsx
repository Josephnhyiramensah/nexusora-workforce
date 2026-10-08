/* =====================================================================
   ErrorBoundary — catches render/runtime errors in the subtree and shows a
   readable error card instead of a blank white screen. Production apps must
   have this: without it, one thrown error unmounts the whole React tree.

   Used inside AppShell around the page body (so the top nav survives a page
   crash) and as an outer safety net around the whole app.
   ===================================================================== */
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // Surface it for debugging; a real app would also report this to a service.
    // eslint-disable-next-line no-console
    console.error('[Nexusora] Uncaught UI error:', error, info?.componentStack);
  }

  // If the subtree identity changes (we pass key={pathname} at the use site),
  // React remounts this boundary, clearing the error on navigation.

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const C = { navy: '#012158', red: '#e5484d', ink: '#16233b', muted: '#67728a', line: '#e6ebf3' };
    return (
      <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 28, fontFamily: 'Inter, system-ui, Arial, sans-serif' }}>
        <div style={{ maxWidth: 620, width: '100%', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, boxShadow: '0 8px 30px rgba(1,33,88,.08)', padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ width: 38, height: 38, borderRadius: 10, display: 'grid', placeItems: 'center', background: '#fdeaea', color: C.red, fontSize: 20, fontWeight: 800 }}>!</span>
            <h2 style={{ margin: 0, color: C.navy, fontSize: '1.2rem', fontWeight: 800 }}>Something went wrong on this page</h2>
          </div>
          <p style={{ color: C.muted, fontSize: '.9rem', lineHeight: 1.6, margin: '0 0 14px' }}>
            The rest of the app is fine — you can go back or reload. If this keeps happening, the message below helps us fix it.
          </p>

          <div style={{ background: '#fbfcfe', border: `1px solid ${C.line}`, borderRadius: 10, padding: '11px 13px', marginBottom: 16 }}>
            <code style={{ color: C.red, fontSize: '.82rem', fontFamily: 'ui-monospace, Menlo, monospace', wordBreak: 'break-word' }}>
              {String(error?.message || error)}
            </code>
            {info?.componentStack && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', fontSize: '.78rem', color: C.muted, fontWeight: 700 }}>Technical details</summary>
                <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', fontSize: '.72rem', color: C.muted, maxHeight: 200, overflow: 'auto' }}>
                  {info.componentStack}
                </pre>
              </details>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => this.setState({ error: null, info: null })}
              style={{ padding: '10px 18px', border: 'none', borderRadius: 10, background: C.navy, color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Try again
            </button>
            <button onClick={() => { window.location.href = '/'; }}
              style={{ padding: '10px 18px', border: `1px solid ${C.line}`, borderRadius: 10, background: '#fff', color: C.ink, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Go to home
            </button>
            <button onClick={() => window.location.reload()}
              style={{ padding: '10px 18px', border: `1px solid ${C.line}`, borderRadius: 10, background: '#fff', color: C.ink, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
