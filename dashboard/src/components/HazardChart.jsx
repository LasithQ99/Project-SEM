import { useEffect, useRef } from 'react';
import { Chart } from 'chart.js/auto';

export default function HazardChart({ gas, dust, temp, thresholds }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');

    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Current Gas', 'Gas Limit', 'Current Dust', 'Dust Limit'],
        datasets: [{
          label: 'Concentration Level',
          data: [0, 700, 0, 150],
          backgroundColor: [
            '#f97316',                 // Orange
            'rgba(249, 115, 22, 0.2)', // Faded Orange
            '#ef4444',                 // Red
            'rgba(239, 68, 68, 0.2)'   // Faded Red
          ],
          borderColor: ['#f97316', '#f97316', '#ef4444', '#ef4444'],
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 400,
          easing: 'easeInOutCubic'
        },
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
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

  // Update chart when values or thresholds change
  useEffect(() => {
    if (!chartRef.current) return;

    const gasLimit = thresholds?.gas?.danger ?? 700;
    const dustLimit = thresholds?.dust?.danger ?? 150;

    chartRef.current.data.datasets[0].data = [
      gas || 0,
      gasLimit,
      dust || 0,
      dustLimit
    ];

    chartRef.current.update();
  }, [gas, dust, thresholds]);

  return (
    <div className="glass-panel p-6 rounded-[2rem] shadow-xl">
      <h3 className="text-base font-bold text-white mb-1">Hazard Levels Analysis</h3>
      <p className="text-xs text-gray-500 mb-6">Comparing current sensor readings against programmed safety thresholds.</p>
      <div className="h-64 w-full relative">
        <canvas ref={canvasRef}></canvas>
      </div>
    </div>
  );
}
