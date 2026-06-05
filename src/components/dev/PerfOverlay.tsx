import { useEffect, useState } from "react";
import { getSnapshot } from "../../utils/perfMonitor";
import type { PerfSnapshot } from "../../utils/perfMonitor";

export function PerfOverlay() {
  const [snap, setSnap] = useState<PerfSnapshot>(getSnapshot);

  useEffect(() => {
    let id: number;
    const poll = () => {
      setSnap(getSnapshot());
      id = requestAnimationFrame(poll);
    };
    id = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(id);
  }, []);

  const top = snap.renderCounts.slice(0, 8);

  return (
    <div className="fixed bottom-3 right-3 z-[9999] bg-black/80 text-green-400 text-[11px] font-mono px-3 py-2 rounded shadow-lg select-none pointer-events-none leading-relaxed">
      <div>
        FPS: <span className={snap.fps >= 55 ? "text-green-400" : snap.fps >= 30 ? "text-yellow-400" : "text-red-400"}>{snap.fps}</span>
        {" · "}Frame: {snap.avgFrameMs}ms
        {" · "}Renders: {snap.renderTotal}
      </div>
      {snap.callbackLatencyMs > 0 && (
        <div>Clock latency: {snap.callbackLatencyMs.toFixed(1)}ms</div>
      )}
      {top.length > 0 && (
        <div className="mt-1 pt-1 border-t border-white/10">
          {top.map(([name, count]) => (
            <div key={name}>
              {name}: <span className={count > 100 ? "text-yellow-400" : "text-green-400"}>{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
