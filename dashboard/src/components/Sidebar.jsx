export default function Sidebar({ connectionState, source }) {
  const isLive = source === 'esp32';
  const isDisconnected = connectionState === 'disconnected';

  const dotColor = isDisconnected ? '#ef4444' : isLive ? '#22c55e' : '#eab308';
  const dotClass = `w-2.5 h-2.5 rounded-full${!isDisconnected && isLive ? ' pulse-led' : ''}`;

  return (
    <aside className="w-66 glass-panel h-[calc(100%-2rem)] flex flex-col justify-between p-6 m-4 rounded-[2rem] relative z-10 shrink-0 shadow-2xl animate-slide-in-left">
      <div>
        {/* Logo Header */}
        <div className="flex items-center gap-3.5 mb-8 pl-1">
          <div className="w-9 h-9 bg-gradient-to-tr from-orange-500 to-amber-400 rounded-2xl flex items-center justify-center text-white shadow-lg glow-orange">
            <i className="fa-solid fa-leaf text-base"></i>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-orange-400 via-amber-300 to-yellow-200 bg-clip-text text-transparent">
            EcoDash
          </h1>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <i className="fa-solid fa-search absolute left-4 top-3.5 text-gray-500 text-xs"></i>
          <input
            type="text"
            placeholder="Search parameters..."
            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/5 rounded-2xl text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500/30 focus:bg-white/10 transition-all duration-300"
          />
        </div>

        {/* Navigation Links */}
        <nav className="space-y-2 mb-8">
          <a href="#" className="flex items-center gap-4 px-4 py-3.5 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-2xl font-semibold text-xs tracking-wider uppercase transition-all duration-300 shadow-[0_0_15px_rgba(249,115,22,0.05)]">
            <i className="fa-regular fa-folder-open text-sm"></i> General
          </a>
          <a href="#" className="flex items-center gap-4 px-4 py-3.5 text-gray-400 hover:bg-white/5 hover:text-white border border-transparent rounded-2xl font-semibold text-xs tracking-wider uppercase transition-all duration-300">
            <i className="fa-solid fa-seedling text-sm"></i> Greenhouse
          </a>
          <a href="#" className="flex items-center gap-4 px-4 py-3.5 text-gray-400 hover:bg-white/5 hover:text-white border border-transparent rounded-2xl font-semibold text-xs tracking-wider uppercase transition-all duration-300">
            <i className="fa-solid fa-industry text-sm"></i> Industrial
          </a>
          <a href="#" className="flex items-center gap-4 px-4 py-3.5 text-gray-400 hover:bg-white/5 hover:text-white border border-transparent rounded-2xl font-semibold text-xs tracking-wider uppercase transition-all duration-300">
            <i className="fa-solid fa-chart-line text-sm"></i> Analysis
          </a>
        </nav>

        {/* Connected Nodes Section */}
        <div className="space-y-2 pt-2 border-t border-white/5">
          <h3 className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest mb-3 ml-2">Connected Nodes</h3>
          <div className="flex items-center justify-between px-4 py-3 bg-indigo-500/5 rounded-2xl border border-indigo-500/10 transition-all duration-300">
            <div className="flex items-center gap-3">
              <div className={dotClass} style={{ backgroundColor: dotColor, boxShadow: `0 0 10px ${dotColor}` }}></div>
              <span className="text-xs font-bold text-indigo-200">ESP32-S3 (Main)</span>
            </div>
            <i className="fa-solid fa-circle-dot text-[10px] text-indigo-400"></i>
          </div>
          <div className="flex items-center justify-between px-4 py-3 hover:bg-white/5 rounded-2xl cursor-pointer border border-transparent hover:border-white/5 transition-all duration-300">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 bg-red-500/30 border border-red-500/50 rounded-full"></div>
              <span className="text-xs font-semibold text-gray-500">Node 2 (Inactive)</span>
            </div>
            <i className="fa-solid fa-ellipsis text-gray-600"></i>
          </div>
        </div>
      </div>

      {/* Disconnect Button */}
      <button className="flex items-center gap-3 text-red-400/80 hover:text-red-400 font-semibold px-4 py-3.5 transition-all duration-300 hover:bg-red-500/5 rounded-2xl border border-transparent hover:border-red-500/10 text-xs uppercase tracking-wider">
        <i className="fa-solid fa-arrow-right-from-bracket text-sm"></i> Disconnect
      </button>
    </aside>
  );
}
