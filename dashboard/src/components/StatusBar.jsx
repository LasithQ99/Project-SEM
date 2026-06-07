import { useEffect, useState } from 'react';

export default function StatusBar({ connectionState, source, lastUpdateTime }) {
  const [elapsed, setElapsed] = useState('-');

  useEffect(() => {
    const interval = setInterval(() => {
      if (lastUpdateTime) {
        const diff = Math.floor((Date.now() - lastUpdateTime) / 1000);
        setElapsed(`${diff}s ago`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUpdateTime]);

  const isLive = source === 'esp32';
  const isDisconnected = connectionState === 'disconnected';

  let dotColor, statusText;
  if (isDisconnected) {
    dotColor = '#ef4444';
    statusText = 'Disconnected - Retrying...';
  } else if (isLive) {
    dotColor = '#22c55e';
    statusText = 'Node 1 (ESP32) · Live';
  } else {
    dotColor = '#eab308';
    statusText = connectionState === 'connecting' ? 'Connecting...' : 'Node 1 (Simulator)';
  }

  const dotClass = `w-2.5 h-2.5 rounded-full${isLive && !isDisconnected ? ' pulse-led' : ''}`;

  return (
    <div className="flex gap-4 mb-8 justify-center">
      <div className="flex flex-col items-center gap-1 glass-panel px-6 py-2.5 rounded-full relative shadow-lg">
        <div className="flex items-center gap-2.5">
          <div className={dotClass} style={{ backgroundColor: dotColor, boxShadow: `0 0 10px ${dotColor}` }}></div>
          <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">{statusText}</span>
        </div>
        <span className="text-[9px] text-gray-500 uppercase tracking-widest font-extrabold absolute -bottom-5">
          Last updated: {elapsed}
        </span>
      </div>
    </div>
  );
}
