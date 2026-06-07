export default function AlertBanner({ overallLevel, alerts }) {
  // --- Lights ---
  const baseLightOff = 'w-7 h-7 rounded-full bg-white/5 border border-white/10 transition-all duration-500';
  const baseLabelOff = 'text-[9px] uppercase tracking-wider font-extrabold text-gray-500';

  let normalLight = baseLightOff, warningLight = baseLightOff, dangerLight = baseLightOff;
  let normalLabel = baseLabelOff, warningLabel = baseLabelOff, dangerLabel = baseLabelOff;
  let bannerExtra = 'border-l-gray-500/40';
  let beeperClass = 'w-10 h-7 rounded-lg border flex items-center justify-center transition-all duration-300 bg-white/5 border-white/10 text-gray-400';
  let beeperIconClass = 'fa-solid fa-volume-high text-xs';
  let beeperLabelText = 'SILENT';
  let beeperLabelClass = baseLabelOff;
  let alertHTML;

  if (overallLevel === 'danger') {
    bannerExtra = 'border-red-500/30 border-l-red-500 bg-red-500/5 shadow-[0_0_30px_rgba(239,68,68,0.08)]';
    dangerLight = 'w-7 h-7 rounded-full bg-red-500 border border-red-400 glow-red pulse-led';
    dangerLabel = 'text-[9px] uppercase tracking-wider font-extrabold text-red-400';
    beeperClass = 'w-10 h-7 rounded-lg border flex items-center justify-center transition-all duration-300 bg-red-500/20 border-red-500/30 text-red-400';
    beeperIconClass = 'fa-solid fa-volume-high text-xs animate-bounce';
    beeperLabelText = 'BEEPING';
    beeperLabelClass = 'text-[9px] uppercase tracking-wider font-extrabold text-red-400 animate-pulse';

    const dangerSensors = (alerts || []).filter(a => a.level === 'danger').map(a => a.sensor);
    alertHTML = (
      <>Hazardous State! Critical levels detected in: {dangerSensors.map((s, i) => (
        <span key={i}><span className="font-extrabold text-red-400">{s}</span>{i < dangerSensors.length - 1 ? ', ' : ''}</span>
      ))}. Automated alerts triggered.</>
    );
  } else if (overallLevel === 'warning') {
    bannerExtra = 'border-orange-500/30 border-l-orange-500 bg-orange-500/5 shadow-[0_0_30px_rgba(249,115,22,0.08)]';
    warningLight = 'w-7 h-7 rounded-full bg-orange-500 border border-orange-400 glow-orange';
    warningLabel = 'text-[9px] uppercase tracking-wider font-extrabold text-orange-400';

    const warnSensors = (alerts || []).filter(a => a.level === 'warning').map(a => a.sensor);
    alertHTML = (
      <>Warning State. Elevated levels detected in: {warnSensors.map((s, i) => (
        <span key={i}><span className="font-extrabold text-orange-400">{s}</span>{i < warnSensors.length - 1 ? ', ' : ''}</span>
      ))}. Please monitor closely.</>
    );
  } else {
    bannerExtra = 'border-white/10 border-l-green-500';
    normalLight = 'w-7 h-7 rounded-full bg-green-500 border border-green-400 glow-green';
    normalLabel = 'text-[9px] uppercase tracking-wider font-extrabold text-green-400';
    alertHTML = 'All environmental sensors are reporting values within optimal safe ranges.';
  }

  return (
    <div className={`glass-panel p-6 rounded-[2rem] mb-8 flex flex-col xl:flex-row items-center justify-between gap-6 relative overflow-hidden transition-all duration-500 border-l-4 shadow-xl ${bannerExtra}`}>
      <div className="flex-1">
        <h3 className="text-lg font-bold text-white mb-1.5 flex items-center gap-2">
          <i className="fa-solid fa-circle-exclamation text-orange-400/80"></i> System Status &amp; Alerts
        </h3>
        <p className="text-sm text-gray-400 leading-relaxed max-w-3xl">{alertHTML}</p>
      </div>

      {/* LED Control Board */}
      <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center gap-5 shrink-0 shadow-inner">
        <div className="flex flex-col items-center gap-1.5">
          <div className={normalLight}></div>
          <span className={normalLabel}>NORMAL</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div className={warningLight}></div>
          <span className={warningLabel}>WARNING</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div className={dangerLight}></div>
          <span className={dangerLabel}>DANGER</span>
        </div>

        <div className="w-[1px] h-9 bg-white/10 mx-1"></div>

        <div className="flex flex-col items-center gap-1.5">
          <div className={beeperClass}>
            <i className={beeperIconClass}></i>
          </div>
          <span className={beeperLabelClass}>{beeperLabelText}</span>
        </div>
      </div>
    </div>
  );
}
