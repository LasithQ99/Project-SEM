import { useEffect, useRef } from 'react';
import { Chart } from 'chart.js/auto';

const THEME = {
  temp:  { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20', color: 'rgb(249, 115, 22)', icon: 'fa-solid fa-temperature-half' },
  hum:   { bg: 'bg-cyan-500/10',   text: 'text-cyan-400',   border: 'border-cyan-500/20',   color: 'rgb(6, 182, 212)',   icon: 'fa-solid fa-droplet' },
  gas:   { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', color: 'rgb(16, 185, 129)', icon: 'fa-solid fa-cloud' },
  dust:  { bg: 'bg-rose-500/10',   text: 'text-rose-400',   border: 'border-rose-500/20',   color: 'rgb(244, 63, 94)',   icon: 'fa-solid fa-smog' },
};

const lineShadowPlugin = {
  id: 'lineShadow',
  beforeDatasetDraw(chart, args) {
    const { ctx } = chart;
    const { meta } = args;
    if (meta.type === 'line') {
      ctx.save();
      ctx.shadowColor = meta.dataset.options.borderColor || 'rgba(0,0,0,0)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;
    }
  },
  afterDatasetDraw(chart, args) {
    const { ctx } = chart;
    const { meta } = args;
    if (meta.type === 'line') {
      ctx.restore();
    }
  }
};

export default function SensorCard({ sensorKey, label, unit, value, status, statusLabel, history, className }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const theme = THEME[sensorKey];

  // Create sparkline chart once
  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 80);
    gradient.addColorStop(0, theme.color.replace(')', ', 0.45)').replace('rgb', 'rgba'));
    gradient.addColorStop(1, theme.color.replace(')', ', 0.0)').replace('rgb', 'rgba'));

    chartRef.current = new Chart(ctx, {
      type: 'line',
      plugins: [lineShadowPlugin],
      data: {
        labels: Array(7).fill(''),
        datasets: [{
          data: Array(7).fill(null),
          borderColor: theme.color,
          backgroundColor: gradient,
          borderWidth: 2,
          fill: true,
          tension: 0.6,
          pointRadius: 0,
          pointHoverRadius: 0,
          pointBorderWidth: 0
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        animation: { duration: 0 }
      }
    });

    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, []);

  // Update sparkline data
  useEffect(() => {
    if (!chartRef.current || !history) return;

    // Pad array with nulls if it has less than 7 elements
    const padded = [...history];
    while (padded.length < 7) {
      padded.unshift(null);
    }
    const last7 = padded.slice(-7);

    const ds = chartRef.current.data.datasets[0];
    ds.data = last7;

    const vals = last7.filter(v => v !== null && !isNaN(v));
    if (vals.length > 0) {
      let min = Math.min(...vals);
      let max = Math.max(...vals);

      if (min === max) {
        if (min === 0) {
          min = -1;
          max = 1;
        } else {
          min = min * 0.9;
          max = max * 1.1;
        }
      } else {
        const diff = max - min;
        min = min - diff * 0.15;
        max = max + diff * 0.15;
      }

      chartRef.current.options.scales.y.min = min;
      chartRef.current.options.scales.y.max = max;
    }
    chartRef.current.update();
  }, [history]);

  // Dynamic status classes
  let cardExtra = '', badgeClass, iconClass;
  if (status === 'danger') {
    cardExtra = 'border-red-500/40 bg-red-500/5 shadow-[0_0_30px_rgba(239,68,68,0.15)]';
    badgeClass = 'inline-block mt-2 px-3.5 py-1 bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] uppercase tracking-wider font-extrabold rounded-full animate-pulse';
    iconClass = 'w-12 h-12 bg-red-500 text-white rounded-2xl flex items-center justify-center text-xl shadow-lg glow-red';
  } else if (status === 'warning') {
    cardExtra = 'border-orange-500/30 bg-orange-500/5 shadow-[0_0_30px_rgba(249,115,22,0.1)]';
    badgeClass = 'inline-block mt-2 px-3.5 py-1 bg-orange-500/20 border border-orange-500/30 text-orange-300 text-[10px] uppercase tracking-wider font-extrabold rounded-full';
    iconClass = 'w-12 h-12 bg-orange-500 text-white rounded-2xl flex items-center justify-center text-xl shadow-lg glow-orange';
  } else {
    badgeClass = 'inline-block mt-2 px-3.5 py-1 bg-green-500/10 border border-green-500/20 text-green-400 text-[10px] uppercase tracking-wider font-extrabold rounded-full';
    iconClass = `w-12 h-12 rounded-2xl flex items-center justify-center text-xl ${theme.bg} ${theme.text} border ${theme.border}`;
  }

  return (
    <div className={`glass-panel glass-panel-hover p-6 rounded-[2rem] flex flex-col justify-between h-56 relative overflow-hidden group transition-all duration-300 ${cardExtra} ${className || ''}`}>
      <div className="flex items-center gap-4 z-10">
        <div className={iconClass}>
          <i className={theme.icon}></i>
        </div>
        <span className="text-base font-medium text-gray-300">{label}</span>
      </div>
      <div className="z-10 mt-2">
        <div className="flex items-baseline gap-1">
          <h2 className="text-5xl font-extrabold tracking-tight text-white">{value ?? '--'}</h2>
          <span className="text-xl text-gray-400 font-semibold">{unit}</span>
        </div>
        <span className={badgeClass}>{statusLabel || 'Loading'}</span>
      </div>
      <div className={`absolute bottom-0 left-0 w-full h-24 ${sensorKey === 'dust' ? 'opacity-65' : 'opacity-60'} group-hover:opacity-90 transition-opacity duration-300`}>
        <canvas ref={canvasRef}></canvas>
      </div>
    </div>
  );
}
