import { useEffect, useRef } from 'react';
import { Chart } from 'chart.js/auto';

const lineShadowPlugin = {
  id: 'lineShadow',
  beforeDatasetDraw(chart, args) {
    const { ctx } = chart;
    const { meta } = args;
    if (meta.type === 'line') {
      ctx.save();
      ctx.shadowColor = meta.dataset.options.borderColor || 'rgba(0,0,0,0)';
      ctx.shadowBlur = 10;
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

export default function TrendsChart({ historyData }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');

    chartRef.current = new Chart(ctx, {
      type: 'line',
      plugins: [lineShadowPlugin],
      data: {
        labels: [],
        datasets: [
          {
            label: 'Temperature (°C)',
            data: [],
            borderColor: '#3b82f6',
            backgroundColor: 'transparent',
            borderWidth: 3,
            fill: false,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 0,
            pointBorderWidth: 0
          },
          {
            label: 'Humidity (%)',
            data: [],
            borderColor: '#06b6d4',
            borderDash: [5, 5],
            backgroundColor: 'transparent',
            borderWidth: 3,
            fill: false,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 0,
            pointBorderWidth: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          x: {
            type: 'number',
            easing: 'linear',
            duration: 40,
            from: NaN,
            delay(ctx) {
              if (ctx.type !== 'data' || ctx.xStarted) {
                return 0;
              }
              ctx.xStarted = true;
              return ctx.index * 40;
            }
          },
          y: {
            type: 'number',
            easing: 'linear',
            duration: 40,
            from(ctx) {
              const yAxis = ctx.chart.scales.y;
              const bottomVal = yAxis ? yAxis.bottom : 0;
              if (ctx.index === 0) {
                return bottomVal;
              }
              const prev = ctx.chart.getDatasetMeta(ctx.datasetIndex).data[ctx.index - 1];
              return prev ? prev.getProps(['y'], true).y : bottomVal;
            },
            delay(ctx) {
              if (ctx.type !== 'data' || ctx.yStarted) {
                return 0;
              }
              ctx.yStarted = true;
              return ctx.index * 40;
            }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              usePointStyle: false,
              boxWidth: 8,
              boxHeight: 8,
              borderRadius: 4,
              color: 'rgba(255, 255, 255, 0.65)',
              font: { family: 'Outfit', size: 11, weight: '500' }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              maxTicksLimit: 8,
              color: 'rgba(255, 255, 255, 0.45)',
              font: { family: 'Outfit', size: 10 }
            }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
            ticks: {
              color: 'rgba(255, 255, 255, 0.45)',
              font: { family: 'Outfit', size: 10 }
            }
          }
        }
      }
    });

    return () => {
      if (chartRef.current) chartRef.current.destroy();
    };
  }, []);

  // Update chart when historyData changes
  useEffect(() => {
    if (!chartRef.current || !historyData) return;

    const labels = historyData.map(d => {
      return new Date(d.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    });

    const temps = historyData.map(d => d.temperature);
    const hums = historyData.map(d => d.humidity);

    chartRef.current.data.labels = labels;
    chartRef.current.data.datasets[0].data = temps;
    chartRef.current.data.datasets[1].data = hums;
    chartRef.current.update();
  }, [historyData]);

  return (
    <div className="glass-panel p-6 rounded-[2rem] shadow-xl">
      <h3 className="text-base font-bold text-white mb-1">Atmospheric Trends</h3>
      <p className="text-xs text-gray-500 mb-6">Tracking temperature and humidity stability over recent readings.</p>
      <div className="h-64 w-full relative">
        <canvas ref={canvasRef}></canvas>
      </div>
    </div>
  );
}
