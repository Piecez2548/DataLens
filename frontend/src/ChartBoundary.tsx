import { Component, type ReactNode } from "react";

// The charts are a lazy chunk. If it still cannot load after the one automatic
// reload (see staleChunkReload.ts), keep the rest of the analysis usable.
export default class ChartBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="panel" role="alert">
        <p>
          Charts could not be loaded. A new version may be available; refresh to
          get it. Your metrics and tables are still shown.
        </p>
        <button type="button" className="report-button" onClick={() => window.location.reload()}>
          Refresh
        </button>
      </section>
    );
  }
}
