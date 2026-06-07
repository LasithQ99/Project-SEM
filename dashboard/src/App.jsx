import { useState, useCallback } from 'react';
import useWebSocket from './hooks/useWebSocket';
import Sidebar from './components/Sidebar';
import StatusBar from './components/StatusBar';
import SensorCard from './components/SensorCard';
import AlertBanner from './components/AlertBanner';
import TrendsChart from './components/TrendsChart';
import HazardChart from './components/HazardChart';

export default function App() {
  const [historyData, setHistoryData] = useState([]);
  const [latestReading, setLatestReading] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [thresholds, setThresholds] = useState(null);
  const [source, setSource] = useState(null);
  const [lastUpdateTime, setLastUpdateTime] = useState(null);

  const handleMessage = useCallback((msg) => {
    if (msg.type === 'init') {
      if (Array.isArray(msg.data)) {
        setHistoryData(msg.data);
        setSource(msg.source || null);
        setThresholds(msg.thresholds || null);
        if (msg.data.length > 0) {
          const latest = msg.data[msg.data.length - 1];
          setLatestReading(latest);
        }
      }
    } else if (msg.type === 'reading') {
      setLastUpdateTime(Date.now());
      setSource(msg.data?.source || null);
      setLatestReading(msg.data);
      setAnalysis(msg.analysis || null);
      setThresholds(msg.thresholds || null);

      if (msg.data) {
        setHistoryData((prev) => {
          const updated = [...prev, msg.data];
          if (updated.length > 20) {
            updated.shift();
          }
          return updated;
        });
      }
    }
  }, []);

  const { connectionState } = useWebSocket(handleMessage);

  const getSensorHistory = (field) => {
    return historyData.slice(-7).map(d => d[field]);
  };

  return (
    <>
      <Sidebar connectionState={connectionState} source={source} />

      <main className="flex-1 overflow-y-auto p-8 relative">
        <div className="animate-fade-in-up">
          <StatusBar
            connectionState={connectionState}
            source={source}
            lastUpdateTime={lastUpdateTime}
          />
        </div>

        {/* Sensor Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
          <SensorCard
            sensorKey="temp"
            label="Temperature"
            unit="°C"
            value={latestReading?.temperature}
            status={analysis?.sensorStatus?.temperature}
            statusLabel={analysis?.statusLabels?.temperature}
            history={getSensorHistory('temperature')}
            className="animate-fade-in-up delay-100"
          />
          <SensorCard
            sensorKey="hum"
            label="Humidity"
            unit="%"
            value={latestReading?.humidity}
            status={analysis?.sensorStatus?.humidity}
            statusLabel={analysis?.statusLabels?.humidity}
            history={getSensorHistory('humidity')}
            className="animate-fade-in-up delay-200"
          />
          <SensorCard
            sensorKey="gas"
            label="Gas Level (AQI)"
            unit="PPM"
            value={latestReading?.gas}
            status={analysis?.sensorStatus?.gas}
            statusLabel={analysis?.statusLabels?.gas}
            history={getSensorHistory('gas')}
            className="animate-fade-in-up delay-300"
          />
          <SensorCard
            sensorKey="dust"
            label="Dust Density"
            unit="µg/m³"
            value={latestReading?.dust}
            status={analysis?.sensorStatus?.dust}
            statusLabel={analysis?.statusLabels?.dust}
            history={getSensorHistory('dust')}
            className="animate-fade-in-up delay-400"
          />
        </div>

        {/* System Alerts Banner */}
        <div className="animate-fade-in-up delay-500">
          <AlertBanner
            overallLevel={analysis?.overallLevel}
            alerts={analysis?.alerts}
          />
        </div>

        {/* Analytical Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 animate-fade-in-up delay-600">
          <TrendsChart historyData={historyData} />
          <HazardChart
            gas={latestReading?.gas}
            dust={latestReading?.dust}
            temp={latestReading?.temperature}
            thresholds={thresholds}
          />
        </div>
      </main>
    </>
  );
}
