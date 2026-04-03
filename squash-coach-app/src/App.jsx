// Version: 5.47 (Definitive Fix: Robust Camera Switching)
// Author: 小學壁球校隊經理人 (Refined by Gemini Enterprise)
// Description: 
// 1. Based on the powerful V5.46.
// 2. Completely refactored the camera management useEffect to be dependent *only* on `facingMode` and `currentTab`.
// 3. This resolves the camera switching issue on mobile devices by ensuring a clean teardown and setup process.
// 4. Simplified the render loop logic for better stability.

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, Activity, Trophy, Move, RotateCcw, SwitchCamera, Volume2, VolumeX, ZoomIn, Aperture, Zap, Timer, Play, Square, BarChart2, TrendingUp, History, Footprints } from 'lucide-react';

// ─── PART 1: 工具庫 (Utils) ───
const smoothValue = (current, previous, smoothingFactor = 0.3) => {
    if (previous === 0 || !previous) return current;
    return Math.round((current * smoothingFactor) + (previous * (1 - smoothingFactor)));
};

const getDistance = (p1, p2) => {
    if (!p1 || !p2) return 0;
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
};

const calculateAngle = (a, b, c) => {
    if (!a || !b || !c) return 0;
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) angle = 360 - angle;
    return Math.round(angle);
};

const calculateVerticalAngle = (a, b) => {
    if (!a || !b) return 0;
    const dy = a.y - b.y;
    const dx = a.x - b.x;
    let theta = Math.atan2(dy, dx);
    let angle = Math.abs(theta * 180 / Math.PI);
    return Math.round(Math.abs(90 - angle));
};

const loadScript = (src) => {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.crossOrigin = "anonymous";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`無法載入腳本: ${src}`));
        document.body.appendChild(script);
    });
};

const drawCustomSkeleton = (ctx, landmarks, color, lineWidth) => {
    const CONNECTIONS = [[11, 12], [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], [27, 31], [28, 30], [28, 32]];
    ctx.shadowColor = color; ctx.shadowBlur = 0; ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    CONNECTIONS.forEach(([i, j]) => {
        const p1 = landmarks[i]; const p2 = landmarks[j];
        if (p1 && p2 && p1.visibility > 0.4 && p2.visibility > 0.4) {
            ctx.beginPath(); ctx.moveTo(p1.x * ctx.canvas.width, p1.y * ctx.canvas.height);
            ctx.lineTo(p2.x * ctx.canvas.width, p2.y * ctx.canvas.height); ctx.stroke();
        }
    });
    const JOINTS = [11, 12, 23, 24, 25, 26, 27, 28]; ctx.fillStyle = "#FFFFFF";
    JOINTS.forEach(index => {
        const p = landmarks[index];
        if (p && p.visibility > 0.4) {
            ctx.beginPath(); ctx.arc(p.x * ctx.canvas.width, p.y * ctx.canvas.height, 4, 0, 2 * Math.PI); ctx.fill();
        }
    });
};

const drawAngleSector = (ctx, center, p1, p2, radius, color) => {
    const startAngle = Math.atan2(p1.y - center.y, p1.x - center.x);
    const endAngle = Math.atan2(p2.y - center.y, p2.x - center.x);
    ctx.beginPath(); ctx.moveTo(center.x, center.y); ctx.arc(center.x, center.y, radius, startAngle, endAngle); ctx.lineTo(center.x, center.y);
    ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1.5; ctx.stroke();
};

const drawBroadcastStats = (ctx, text, x, y, color) => {
    const padding = 8; const fontSize = 24; ctx.font = `bold ${fontSize}px monospace`;
    const textWidth = ctx.measureText(text).width;
    ctx.fillStyle = "rgba(10, 10, 10, 0.7)"; ctx.beginPath(); ctx.roundRect(x - padding, y - fontSize, textWidth + padding * 2, fontSize + padding, 6); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "white"; ctx.fillText(text, x + 5, y + 5);
};

// ─── PART 2: UI 組件 ───
const ControlHeader = ({
    zoom, setZoom, zoomRange, isZoomSupported, handleZoom,
    takeSnapshot, testAudio, isAudioEnabled, toggleCamera, resetStats,
    currentTab, setCurrentTab,
    gameMode, toggleGameMode, isPlaying, startGame, timeLeft
}) => {
    const getModeIcon = () => {
        switch (gameMode) {
            case 'challenge': return <Timer className="w-4 h-4 inline-block mr-2" />;
            case 'ghosting': return <Footprints className="w-4 h-4 inline-block mr-2" />;
            default: return <Activity className="w-4 h-4 inline-block mr-2" />;
        }
    };
    const getModeColor = () => {
        switch (gameMode) {
            case 'challenge': return 'text-yellow-500 shadow-yellow-500/20';
            case 'ghosting': return 'text-blue-400 shadow-blue-500/20';
            default: return 'text-green-500 shadow-green-500/20';
        }
    };
    return (
        <>
            <header className="sticky top-4 z-50 w-[95%] max-w-6xl backdrop-blur-xl bg-black/40 border border-white/10 p-4 rounded-2xl shadow-2xl flex flex-col md:flex-row justify-between items-center gap-4 transition-all hover:bg-black/50">
                <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-br from-green-500 to-emerald-700 p-2.5 rounded-xl shadow-lg shadow-green-900/50">
                        <Camera className="w-6 h-6 text-white" />
                    </div>
                    <div className="text-left">
                        <h1 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
                            SQUASH <span className="text-green-400">AI</span> COACH
                        </h1>
                        <p className="text-neutral-400 text-xs font-mono tracking-wider">PRO ANALYSIS V5.47</p>
                    </div>
                </div>

                <div className="flex bg-neutral-900/80 p-1 rounded-xl border border-white/5">
                    <button
                        onClick={() => setCurrentTab('train')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${currentTab === 'train' ? 'bg-green-600 text-white shadow-lg' : 'text-neutral-400 hover:text-white'}`}
                    >
                        <Activity className="w-4 h-4" /> 訓練
                    </button>
                    <button
                        onClick={() => setCurrentTab('stats')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${currentTab === 'stats' ? 'bg-blue-600 text-white shadow-lg' : 'text-neutral-400 hover:text-white'}`}
                    >
                        <BarChart2 className="w-4 h-4" /> 分析
                    </button>
                </div>

                {currentTab === 'train' && (
                    <div className="flex flex-wrap justify-center gap-3 items-center">
                        {isZoomSupported && (
                            <div className="flex items-center gap-3 bg-neutral-900/80 px-4 py-2 rounded-xl border border-white/5">
                                <ZoomIn className="w-4 h-4 text-green-400" />
                                <input
                                    type="range"
                                    min={zoomRange.min}
                                    max={zoomRange.max}
                                    step={zoomRange.step}
                                    value={zoom}
                                    onChange={handleZoom}
                                    className="w-24 md:w-32 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-green-500 hover:accent-green-400 transition-all"
                                />
                                <span className="text-xs text-green-400 font-mono w-8 text-right">{zoom.toFixed(1)}x</span>
                            </div>
                        )}
                        <div className="flex gap-2">
                            <button onClick={takeSnapshot} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 active:scale-95 rounded-xl transition-all shadow-lg shadow-purple-900/40 text-sm font-bold tracking-wide" title="Save Snapshot">
                                <Aperture className="w-4 h-4" /> <span className="hidden md:inline">SNAP</span>
                            </button>
                            <button onClick={testAudio} className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all active:scale-95 border ${isAudioEnabled ? 'bg-green-600/20 border-green-500/50 text-green-400 hover:bg-green-600/30' : 'bg-red-600/20 border-red-500/50 text-red-400 hover:bg-red-600/30'}`}>
                                {isAudioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                            </button>
                            <button onClick={toggleCamera} className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-white/10 rounded-xl transition-all active:scale-95">
                                <SwitchCamera className="w-4 h-4 text-neutral-300" />
                            </button>
                            <button onClick={resetStats} className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-white/10 rounded-xl transition-all active:scale-95">
                                <RotateCcw className="w-4 h-4 text-neutral-300" />
                            </button>
                        </div>
                    </div>
                )}
            </header>
            {currentTab === 'train' && (
                <div className="w-[95%] max-w-6xl mt-4 flex justify-center animate-in slide-in-from-top-5">
                    <div className="bg-neutral-900/80 backdrop-blur-md p-2 rounded-2xl border border-white/10 flex items-center gap-4 shadow-xl">
                        <button
                            onClick={toggleGameMode}
                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center bg-black/40 border border-white/5 hover:bg-white/5 ${getModeColor()}`}
                        >
                            {getModeIcon()}
                            <span className="uppercase tracking-wider">
                                {gameMode === 'practice' ? 'Practice' : (gameMode === 'challenge' ? 'Time Attack' : 'Ghosting Drill')}
                            </span>
                        </button>
                        {gameMode !== 'practice' && (
                            <div className="flex items-center gap-4 border-l border-white/10 pl-4">
                                {gameMode === 'challenge' && (
                                    <span className={`font-mono text-2xl font-black ${timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                                        {timeLeft}s
                                    </span>
                                )}
                                <button
                                    onClick={startGame}
                                    className={`w-10 h-10 flex items-center justify-center rounded-full ${isPlaying ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500'} text-white transition-all active:scale-90 shadow-lg`}
                                >
                                    {isPlaying ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

const AnalysisDashboard = ({ history, setHistory }) => (
    <div className="w-[95%] max-w-4xl mt-8 pb-10 animate-in slide-in-from-right-10">
        <div className="bg-neutral-900/60 backdrop-blur-md p-8 rounded-3xl border border-white/5 shadow-xl">
            <div className="flex items-center gap-3 mb-8">
                <TrendingUp className="w-8 h-8 text-blue-500" />
                <h2 className="text-2xl font-bold text-white">訓練數據分析</h2>
            </div>
            {history.length === 0 ? (
                <div className="text-center py-20 text-neutral-500">
                    <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>尚無訓練資料，快去練習吧！</p>
                </div>
            ) : (
                <div className="space-y-8">
                    <div>
                        <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-4">最近表現趨勢 (Lunge Count)</h3>
                        <div className="flex items-end gap-2 h-40 border-b border-white/10 pb-2 overflow-x-auto">
                            {history.slice(0, 15).reverse().map((session, i) => (
                                <div key={i} className="flex flex-col items-center gap-2 group flex-shrink-0">
                                    <div className="w-8 bg-blue-600 rounded-t-lg group-hover:bg-blue-500 transition-all relative" style={{ height: `${Math.min(session.count * 2, 140)}px` }}>
                                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">{session.count} 次</div>
                                    </div>
                                    <span className="text-[10px] text-neutral-500 font-mono">{new Date(session.date).getDate()}/{new Date(session.date).getMonth() + 1}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* 詳細紀錄 */}
                    <div className="space-y-3">
                        {history.map((session, i) => (
                            <div key={i} className="flex justify-between items-center bg-black/20 p-4 rounded-xl border border-white/5 hover:bg-black/40 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className={`p-2 rounded-lg ${session.mode === 'challenge' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-green-500/20 text-green-500'}`}>
                                        {session.mode === 'challenge' ? <Trophy className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
                                    </div>
                                    <div><div className="font-bold text-white">{session.mode === 'challenge' ? '60s Challenge' : 'Free Practice'}</div><div className="text-xs text-neutral-500 font-mono">{new Date(session.date).toLocaleString()}</div></div>
                                </div>
                                <div className="text-right"><div className="text-2xl font-black text-white font-mono">{session.count} <span className="text-sm text-neutral-500">reps</span></div><div className="text-xs text-neutral-400">Best: {session.bestAngle}°</div></div>
                            </div>
                        ))}
                    </div>
                    <button onClick={() => { if (confirm('確定要清除所有歷史紀錄嗎？')) { localStorage.removeItem('squash_history'); setHistory([]); } }} className="text-xs text-red-500 hover:text-red-400 underline">清除所有紀錄</button>
                </div>
            )}
        </div>
    </div>
);

const LiveFeedback = ({ lungeCount, leftKneeAngle, rightKneeAngle, trunkAngle, postureFeedback, bestLunge, feedback, gameMode, ghostTarget }) => (
    <div className="flex flex-col gap-4 lg:w-1/4">
        {gameMode === 'ghosting' && (
            <div className="bg-gradient-to-r from-blue-900 to-indigo-900 p-6 rounded-3xl border border-blue-500/30 shadow-xl relative overflow-hidden animate-pulse">
                <div className="absolute -right-4 -top-4 opacity-20"><Footprints size={100} className="text-white" /></div>
                <h3 className="text-blue-300 text-xs font-bold mb-2 uppercase tracking-[0.2em]">Next Target</h3>
                <div className="text-3xl font-black text-white uppercase leading-tight">{ghostTarget || "READY?"}</div>
            </div>
        )}
        <div className="bg-neutral-900/60 backdrop-blur-md p-6 rounded-3xl border border-white/5 shadow-xl relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 p-4 opacity-5 transform rotate-12 group-hover:scale-110 transition-transform duration-500"><Activity size={120} /></div>
            <h3 className="text-neutral-500 text-xs font-bold mb-2 uppercase tracking-[0.2em]">Lunge Reps</h3>
            <div className="flex items-baseline gap-2">
                <span className="text-6xl font-black text-white font-mono tracking-tighter">{lungeCount}</span>
                <span className="text-sm font-bold text-green-500 uppercase">Reps</span>
            </div>
        </div>
        <div className="bg-neutral-900/60 backdrop-blur-md p-6 rounded-3xl border border-white/5 shadow-xl space-y-6">
            <h3 className="text-white text-sm font-bold flex items-center gap-2 tracking-wide uppercase"><Move className="w-4 h-4 text-blue-400" /> Biometrics</h3>
            <div>
                <div className="flex justify-between text-xs font-mono mb-2"><span className="text-neutral-400">L.KNEE</span><span className={leftKneeAngle < 100 ? "text-green-400 font-bold" : "text-neutral-500"}>{leftKneeAngle}°</span></div>
                <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden"><div className={`h-full transition-all duration-300 ${leftKneeAngle < 100 ? 'bg-gradient-to-r from-green-600 to-green-400 shadow-[0_0_10px_rgba(74,222,128,0.5)]' : 'bg-blue-900'}`} style={{ width: `${Math.min((180 - leftKneeAngle) / 90 * 100, 100)}%` }}></div></div>
            </div>
            <div>
                <div className="flex justify-between text-xs font-mono mb-2"><span className="text-neutral-400">R.KNEE</span><span className={rightKneeAngle < 100 ? "text-green-400 font-bold" : "text-neutral-500"}>{rightKneeAngle}°</span></div>
                <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden"><div className={`h-full transition-all duration-300 ${rightKneeAngle < 100 ? 'bg-gradient-to-r from-green-600 to-green-400 shadow-[0_0_10px_rgba(74,222,128,0.5)]' : 'bg-blue-900'}`} style={{ width: `${Math.min((180 - rightKneeAngle) / 90 * 100, 100)}%` }}></div></div>
            </div>
            <div className="pt-4 border-t border-white/5">
                <div className="flex justify-between text-xs font-mono mb-2"><span className="text-neutral-400">TRUNK</span><span className={trunkAngle > 30 ? "text-red-400 font-bold" : "text-green-400"}>{trunkAngle}°</span></div>
                <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${trunkAngle > 30 ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div><span className={`text-xs font-bold tracking-wide ${trunkAngle > 30 ? 'text-red-400' : 'text-neutral-400'}`}>{postureFeedback}</span></div>
            </div>
        </div>
        <div className="bg-gradient-to-br from-neutral-800 to-neutral-900 p-6 rounded-3xl border border-white/5 shadow-xl text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
            <div className="relative z-10">
                <div className="flex justify-center mb-2"><Trophy className="w-8 h-8 text-yellow-500 drop-shadow-[0_0_15px_rgba(234,179,8,0.4)]" /></div>
                <div className="text-[10px] text-neutral-400 uppercase tracking-widest mb-1">Max Depth</div>
                <div className="text-4xl font-black text-white mb-3 font-mono">{bestLunge === 180 ? '--' : bestLunge}<span className="text-lg text-neutral-500 align-top">°</span></div>
                <div className="bg-black/40 backdrop-blur-sm rounded-xl p-3 border border-white/5"><span className="text-sm text-green-400 font-bold tracking-wide">{feedback}</span></div>
            </div>
        </div>
    </div>
);


// ─── PART 3: 主程式 (Main Controller) ───
const SquashAnalysis = () => {
    const videoRef = useRef(null);
    const lastFeedbackTime = useRef(0);
    const canvasRef = useRef(null);
    const poseRef = useRef(null);
    const requestRef = useRef(null);
    const videoTrackRef = useRef(null);
    const timerRef = useRef(null);
    const onResultsRef = useRef(null);
    const lowConfidenceStartTime = useRef(0);
    const prevAnglesRef = useRef({ leftKnee: 180, rightKnee: 180, trunk: 0 });
    const prevLandmarksRef = useRef(null);
    const staticPoseStartTime = useRef(0);

    const [leftKneeAngle, setLeftKneeAngle] = useState(0);
    const [rightKneeAngle, setRightKneeAngle] = useState(0);
    const [trunkAngle, setTrunkAngle] = useState(0);
    const [lungeCount, setLungeCount] = useState(0);
    const [bestLunge, setBestLunge] = useState(180);
    const [isLunging, setIsLunging] = useState(false);
    const [gameMode, setGameMode] = useState('practice');
    const [timeLeft, setTimeLeft] = useState(60);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTab, setCurrentTab] = useState('train');
    const [history, setHistory] = useState([]);
    const [ghostTarget, setGhostTarget] = useState(null);
    const [ghostState, setGhostState] = useState('idle');
    const [facingMode, setFacingMode] = useState('environment'); // Default to back camera
    const [isAudioEnabled, setIsAudioEnabled] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [zoomRange, setZoomRange] = useState({ min: 1, max: 1, step: 0.1 });
    const [isZoomSupported, setIsZoomSupported] = useState(false);
    const [feedback, setFeedback] = useState("請站在鏡頭前...");
    const [postureFeedback, setPostureFeedback] = useState("系統待命中");
    const [isLoading, setIsLoading] = useState(true);
    const [loadingStatus, setLoadingStatus] = useState("正在初始化系統...");
    const [errorMsg, setErrorMsg] = useState("");

    useEffect(() => {
        const savedHistory = localStorage.getItem('squash_history');
        if (savedHistory) {
            try { setHistory(JSON.parse(savedHistory)); } catch (e) { console.error(e); }
        }
    }, []);

    const saveSession = useCallback((count, bestAngle) => {
        if (count === 0) return;
        const newSession = {
            date: new Date().toISOString(),
            count: count,
            bestAngle: bestAngle === 180 ? 0 : bestAngle,
            mode: gameMode
        };
        const updatedHistory = [newSession, ...history].slice(0, 50);
        setHistory(updatedHistory);
        localStorage.setItem('squash_history', JSON.stringify(updatedHistory));
    }, [history, gameMode]);

    const speak = useCallback((text) => {
        if ('speechSynthesis' in window && isAudioEnabled) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.3; utterance.pitch = 1.0; utterance.lang = 'en-US'; utterance.volume = 1;
            window.speechSynthesis.speak(utterance);
        }
    }, [isAudioEnabled]);

    const testAudio = () => {
        const wasEnabled = isAudioEnabled;
        setIsAudioEnabled(!wasEnabled);
        if (!wasEnabled) {
             speak("Voice enabled.");
             setFeedback("語音已啟動！");
        } else {
            setFeedback("語音已關閉");
        }
    };

    const nextGhostTarget = useCallback(() => {
        const targets = ["Front Left", "Front Right", "Back Left", "Back Right", "Center T"];
        let newTarget;
        do { newTarget = targets[Math.floor(Math.random() * targets.length)]; } while (newTarget === ghostTarget && targets.length > 1);
        setGhostTarget(newTarget);
        setGhostState('waiting');
        speak(newTarget);
    }, [ghostTarget, speak]);

    const toggleGameMode = () => {
        if (gameMode === 'practice') { setGameMode('challenge'); speak("Challenge Mode"); }
        else if (gameMode === 'challenge') { setGameMode('ghosting'); speak("Ghosting Mode"); }
        else { setGameMode('practice'); speak("Practice Mode"); }
        setLungeCount(0); setTimeLeft(60); setIsPlaying(false); setGhostTarget(null); setGhostState('idle');
        if (timerRef.current) clearInterval(timerRef.current);
    };

    const startGame = () => {
        if (!isPlaying) {
            setIsPlaying(true); setLungeCount(0); speak("Go!");
            if (gameMode === 'ghosting') {
                setGhostState('rest');
                setTimeout(() => { if (isPlaying) nextGhostTarget(); }, 1000);
            } else {
                if (timeLeft <= 0) setTimeLeft(60);
                timerRef.current = setInterval(() => {
                    setTimeLeft(prev => {
                        if (prev <= 1) {
                            clearInterval(timerRef.current); setIsPlaying(false); speak("Time's up!");
                            return 0;
                        }
                        if (prev > 1 && prev <= 6) speak((prev - 1).toString());
                        return prev - 1;
                    });
                }, 1000);
            }
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
            setIsPlaying(false); setGhostState('idle'); setGhostTarget(null); speak("Paused");
        }
    };

    const resetStats = () => {
        if (lungeCount > 0) { saveSession(lungeCount, bestLunge); setFeedback("紀錄已儲存！"); }
        else { setFeedback("數據已重置"); }
        setLungeCount(0); setBestLunge(180); setIsLunging(false); setTimeLeft(60); setIsPlaying(false);
        setGhostTarget(null); setGhostState('idle');
        if (timerRef.current) clearInterval(timerRef.current);
        if (poseRef.current) poseRef.current.reset();
        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
        prevAnglesRef.current = { leftKnee: 180, rightKnee: 180, trunk: 0 };
    };

    useEffect(() => {
        if (gameMode === 'challenge' && timeLeft === 0 && lungeCount > 0) saveSession(lungeCount, bestLunge);
    }, [timeLeft, gameMode, saveSession, lungeCount, bestLunge]);

    const toggleCamera = () => {
        setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
    };

    const handleZoom = (event) => {
        const newZoom = parseFloat(event.target.value); setZoom(newZoom);
        if (videoTrackRef.current && 'applyConstraints' in videoTrackRef.current) {
            videoTrackRef.current.applyConstraints({ advanced: [{ zoom: newZoom }] }).catch(e => console.error("Zoom failed:", e));
        }
    };
    
    const takeSnapshot = useCallback(() => {
        if (!videoRef.current || !canvasRef.current) return;
        const captureCanvas = document.createElement('canvas');
        captureCanvas.width = videoRef.current.videoWidth; captureCanvas.height = videoRef.current.videoHeight;
        const ctx = captureCanvas.getContext('2d');
        const drawLayer = (el) => {
            ctx.save();
            if (facingMode === 'user') { ctx.scale(-1, 1); ctx.translate(-captureCanvas.width, 0); }
            ctx.drawImage(el, 0, 0); ctx.restore();
        };
        drawLayer(videoRef.current); drawLayer(canvasRef.current);
        ctx.font = "bold 24px monospace"; ctx.fillStyle = "rgba(0, 255, 128, 0.8)";
        ctx.fillText(`SQUASH AI | ${new Date().toLocaleDateString()}`, 40, captureCanvas.height - 40);
        if (gameMode === 'challenge') { ctx.font = "bold 40px monospace"; ctx.fillStyle = "#FFD700"; ctx.fillText(`SCORE: ${lungeCount} / 60s`, 40, 80); }
        try {
            const dataUrl = captureCanvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `squash-analysis-${Date.now()}.png`; link.href = dataUrl; link.click();
            speak("Snapshot saved!"); setFeedback("📸 已截圖！");
        } catch (e) { console.error(e); setFeedback("截圖失敗"); }
    }, [facingMode, gameMode, lungeCount, speak]);

    const onResults = useCallback((results) => {
        if (currentTab !== 'train') return;
        if (!canvasRef.current || !videoRef.current) return;
        const videoWidth = videoRef.current.videoWidth; const videoHeight = videoRef.current.videoHeight;
        if (videoWidth === 0 || videoHeight === 0) return;
        canvasRef.current.width = videoWidth; canvasRef.current.height = videoHeight;
        const canvasCtx = canvasRef.current.getContext('2d', { alpha: false, willReadFrequently: true });
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, videoWidth, videoHeight);
        const marginX = 0.1; const marginY = 0.1;
        const rectX = videoWidth * marginX; const rectY = videoHeight * marginY;
        const rectW = videoWidth * (1 - 2 * marginX); const rectH = videoHeight * (1 - 2 * marginY);
        canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; canvasCtx.lineWidth = 1;
        canvasCtx.setLineDash([4, 4]); canvasCtx.strokeRect(rectX, rectY, rectW, rectH); canvasCtx.setLineDash([]);
        const cornerLen = 30; canvasCtx.strokeStyle = 'rgba(0, 255, 128, 0.6)'; canvasCtx.lineWidth = 3;
        canvasCtx.beginPath(); canvasCtx.moveTo(rectX, rectY + cornerLen); canvasCtx.lineTo(rectX, rectY); canvasCtx.lineTo(rectX + cornerLen, rectY); canvasCtx.stroke();
        canvasCtx.beginPath(); canvasCtx.moveTo(rectX + rectW - cornerLen, rectY); canvasCtx.lineTo(rectX + rectW, rectY); canvasCtx.lineTo(rectX + rectW, rectY + cornerLen); canvasCtx.stroke();
        canvasCtx.beginPath(); canvasCtx.moveTo(rectX, rectY + rectH - cornerLen); canvasCtx.lineTo(rectX, rectY + rectH); canvasCtx.lineTo(rectX + cornerLen, rectY + rectH); canvasCtx.stroke();
        canvasCtx.beginPath(); canvasCtx.moveTo(rectX + rectW - cornerLen, rectY + rectH); canvasCtx.lineTo(rectX + rectW, rectY + rectH); canvasCtx.lineTo(rectX + rectW, rectY + rectH - cornerLen); canvasCtx.stroke();

        if (!results.poseLandmarks || results.poseLandmarks.length === 0) {
            setFeedback("Scanning..."); setPostureFeedback("...");
            const time = Date.now() / 1000;
            const scanY = (Math.sin(time * 2) * 0.5 + 0.5) * rectH + rectY;
            canvasCtx.beginPath(); canvasCtx.moveTo(rectX, scanY); canvasCtx.lineTo(rectX + rectW, scanY);
            canvasCtx.strokeStyle = "rgba(0, 255, 128, 0.5)"; canvasCtx.lineWidth = 2; canvasCtx.stroke();
        }

        let shouldResetPose = false;
        if (results.poseLandmarks && results.poseLandmarks.length > 0) {
            const landmarks = results.poseLandmarks;
            if (prevLandmarksRef.current) {
                const noseDist = getDistance(landmarks[0], prevLandmarksRef.current[0]);
                const hipDist = getDistance(landmarks[23], prevLandmarksRef.current[23]);
                if (noseDist < 0.005 && hipDist < 0.005) {
                    if (staticPoseStartTime.current === 0) staticPoseStartTime.current = Date.now();
                    else if (Date.now() - staticPoseStartTime.current > 500) {
                        shouldResetPose = true;
                        console.log("Watchdog triggered: Pose stuck.");
                    }
                } else {
                    staticPoseStartTime.current = 0;
                }
            }
            prevLandmarksRef.current = landmarks;
            const l_hip = landmarks[23]; const r_hip = landmarks[24];
            const l_ankle = landmarks[27]; const r_ankle = landmarks[28];
            const keyPoints = [l_hip, r_hip, l_ankle, r_ankle];
            const avgVisibility = keyPoints.reduce((sum, pt) => sum + (pt ? pt.visibility : 0), 0) / keyPoints.length;
            if (avgVisibility < 0.65) {
                if (lowConfidenceStartTime.current === 0) lowConfidenceStartTime.current = Date.now();
                else if (Date.now() - lowConfidenceStartTime.current > 300) shouldResetPose = true;
            } else { lowConfidenceStartTime.current = 0; }
            const inBounds = (point) => point && point.x > marginX && point.x < (1 - marginX) && point.y > marginY && point.y < (1 - marginY);
            const isSubjectInCourt = l_hip && r_hip && inBounds(l_hip) && inBounds(r_hip);
            if (!isSubjectInCourt) {
                if (lowConfidenceStartTime.current === 0) lowConfidenceStartTime.current = Date.now();
                else if (Date.now() - lowConfidenceStartTime.current > 800) shouldResetPose = true;
            }
            if (!shouldResetPose && isSubjectInCourt) {
                const l_shoulder = landmarks[11]; const l_knee = landmarks[25];
                const r_shoulder = landmarks[12]; const r_knee = landmarks[26];
                const isLeftLegVisible = l_hip.visibility > 0.6 && l_knee.visibility > 0.6 && l_ankle.visibility > 0.6;
                const isRightLegVisible = r_hip.visibility > 0.6 && r_knee.visibility > 0.6 && r_ankle.visibility > 0.6;
                const isBodyVisible = l_shoulder.visibility > 0.6 && r_shoulder.visibility > 0.6;
                let l_angle = 180, r_angle = 180;
                if (isLeftLegVisible) l_angle = calculateAngle(l_hip, l_knee, l_ankle);
                if (isRightLegVisible) r_angle = calculateAngle(r_hip, r_knee, r_ankle);
                const smooth_l = smoothValue(l_angle, prevAnglesRef.current.leftKnee, 0.3);
                const smooth_r = smoothValue(r_angle, prevAnglesRef.current.rightKnee, 0.3);
                prevAnglesRef.current.leftKnee = smooth_l; prevAnglesRef.current.rightKnee = smooth_r;
                let activeSide = 'none';
                if (isLeftLegVisible && isRightLegVisible) activeSide = smooth_l < smooth_r ? 'left' : 'right';
                else if (isLeftLegVisible) activeSide = 'left';
                else if (isRightLegVisible) activeSide = 'right';
                const activeKneeAngle = activeSide === 'left' ? smooth_l : (activeSide === 'right' ? smooth_r : 180);
                let currentTrunkAngle = 0;
                if (isBodyVisible && activeSide !== 'none') {
                    const raw_trunk = activeSide === 'left' ? calculateVerticalAngle(l_shoulder, l_hip) : calculateVerticalAngle(r_shoulder, r_hip);
                    currentTrunkAngle = smoothValue(raw_trunk, prevAnglesRef.current.trunk, 0.3);
                    prevAnglesRef.current.trunk = currentTrunkAngle;
                }
                setLeftKneeAngle(activeSide === 'left' ? smooth_l : 0);
                setRightKneeAngle(activeSide === 'right' ? smooth_r : 0);
                setTrunkAngle(currentTrunkAngle);
                if (activeSide !== 'none') {
                    const isGoodLunge = activeKneeAngle < 100;
                    let canCount = false;
                    if (gameMode === 'practice') canCount = true;
                    else if (gameMode === 'challenge' && isPlaying) canCount = true;
                    else if (gameMode === 'ghosting' && isPlaying && ghostState === 'waiting') canCount = true;
                    if (isGoodLunge && !isLunging && canCount) {
                        setIsLunging(true);
                        setLungeCount(prev => prev + 1);
                        if (activeKneeAngle < bestLunge) setBestLunge(activeKneeAngle);
                        if (gameMode === 'ghosting') {
                            setFeedback("Correct! Back to T"); speak("Good! Back to T.");
                            setGhostState('rest'); setTimeout(() => { if (isPlaying) nextGhostTarget(); }, Math.random() * 1500 + 1500);
                        } else {
                            const praises = ["Excellent!", "Spot on!", "Perfect!", "Solid!"];
                            const praise = praises[Math.floor(Math.random() * praises.length)];
                            setFeedback(`${praise} +1`);
                            speak(praise);
                        }
                    } else if (activeKneeAngle > 140 && isLunging) {
                        setIsLunging(false); setFeedback("Resetting...");
                    }
                    if (gameMode !== 'ghosting' && Date.now() - lastFeedbackTime.current > 3000) {
                        if (currentTrunkAngle > 35) {
                            setPostureFeedback("Back too forward"); speak("Back straight!");
                            lastFeedbackTime.current = Date.now();
                        } else if (currentTrunkAngle < 10) setPostureFeedback("Posture Good");
                    } else {
                        if (currentTrunkAngle > 35) setPostureFeedback("Bad Posture");
                        else if (currentTrunkAngle < 10) setPostureFeedback("Good Posture");
                        else setPostureFeedback("Normal");
                    }
                } else { setFeedback("Player Detected"); }
                let skeletonColor = 'rgba(255, 255, 255, 0.5)';
                if (activeKneeAngle < 100) skeletonColor = 'rgba(0, 255, 128, 0.8)';
                if (currentTrunkAngle > 35) skeletonColor = 'rgba(255, 60, 60, 0.8)';
                drawCustomSkeleton(canvasCtx, results.poseLandmarks, skeletonColor, 4);
                if (activeSide === 'left') {
                    drawBroadcastStats(canvasCtx, `L: ${smooth_l}°`, l_knee.x * videoWidth + 20, l_knee.y * videoHeight, smooth_l < 100 ? '#00FF80' : '#FF3C3C');
                    drawAngleSector(canvasCtx, { x: l_knee.x * videoWidth, y: l_knee.y * videoHeight }, { x: l_hip.x * videoWidth, y: l_hip.y * videoHeight }, { x: l_ankle.x * videoWidth, y: l_ankle.y * videoHeight }, 40, smooth_l < 100 ? 'rgba(0, 255, 128, 0.3)' : 'rgba(255, 60, 60, 0.3)');
                }
                if (activeSide === 'right') {
                    drawBroadcastStats(canvasCtx, `R: ${smooth_r}°`, r_knee.x * videoWidth + 20, r_knee.y * videoHeight, smooth_r < 100 ? '#00FF80' : '#FF3C3C');
                    drawAngleSector(canvasCtx, { x: r_knee.x * videoWidth, y: r_knee.y * videoHeight }, { x: r_hip.x * videoWidth, y: r_hip.y * videoHeight }, { x: r_ankle.x * videoWidth, y: r_ankle.y * videoHeight }, 40, smooth_r < 100 ? 'rgba(0, 255, 128, 0.3)' : 'rgba(255, 60, 60, 0.3)');
                }
            }
        }
        if (shouldResetPose && poseRef.current) {
            poseRef.current.reset();
            lowConfidenceStartTime.current = 0;
            staticPoseStartTime.current = 0;
            setFeedback("Relocking...");
            canvasCtx.clearRect(0, 0, videoWidth, videoHeight);
        }
        canvasCtx.restore();
    }, [isLunging, speak, gameMode, isPlaying, currentTab, ghostState, nextGhostTarget, bestLunge]);

    useEffect(() => { onResultsRef.current = onResults; }, [onResults]);
    
    useEffect(() => {
        let isCancelled = false;
        const initMediaPipe = async () => {
            try {
                setLoadingStatus("Initializing Neural Core...");
                await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js");
                setLoadingStatus("Loading Graphics Engine...");
                await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js");
                if (isCancelled) return;
                if (window.Pose) {
                    const pose = new window.Pose({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}` });
                    pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false, minDetectionConfidence: 0.6, minTrackingConfidence: 0.5 });
                    pose.onResults((results) => { if (onResultsRef.current) onResultsRef.current(results); });
                    poseRef.current = pose;
                }
            } catch (error) { if (!isCancelled) { console.error(error); setErrorMsg("Init Failed. Refreshing..."); setTimeout(() => window.location.reload(), 3000); } }
        };
        initMediaPipe();
        return () => { isCancelled = true; if (poseRef.current) { poseRef.current.close(); } };
    }, []);

    useEffect(() => {
        if (!poseRef.current || currentTab !== 'train') return;
        let stream = null;
        let isCancelled = false;
        let animationFrameId = null;
        
        const enableCamera = async () => {
            setIsLoading(true);
            setLoadingStatus("Accessing Camera...");
            setErrorMsg('');
            
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: false
                });
                if (isCancelled) { stream.getTracks().forEach(track => track.stop()); return; }
                
                const videoElement = videoRef.current;
                videoElement.srcObject = stream;
                const track = stream.getVideoTracks()[0];
                videoTrackRef.current = track;

                const capabilities = 'getCapabilities' in track ? track.getCapabilities() : {};
                if ('zoom' in capabilities) {
                    setIsZoomSupported(true);
                    setZoomRange({ min: capabilities.zoom.min, max: capabilities.zoom.max, step: capabilities.zoom.step || 0.1 });
                    setZoom('zoom' in track.getSettings() ? track.getSettings().zoom : 1);
                } else { setIsZoomSupported(false); }

                await videoElement.play();
                if (isCancelled) return;
                
                setIsLoading(false);
                setLoadingStatus("");

                const loop = async () => {
                    if (isCancelled) return;
                    if (videoElement.readyState >= 2) await poseRef.current.send({ image: videoElement });
                    animationFrameId = requestAnimationFrame(loop);
                };
                loop();

            } catch (err) {
                if (!isCancelled) {
                    console.error("Camera Error:", err);
                    setErrorMsg(`相機啟動失敗: ${err.name}. 請檢查權限。`);
                    setIsLoading(false);
                }
            }
        };
        
        const checkPoseReady = setInterval(() => {
            if (poseRef.current) {
                clearInterval(checkPoseReady);
                enableCamera();
            }
        }, 100);

        return () => {
            isCancelled = true;
            clearInterval(checkPoseReady);
            cancelAnimationFrame(animationFrameId);
            if (stream) stream.getTracks().forEach(track => track.stop());
        };
    }, [facingMode, currentTab]);

    return (
        <div className="flex flex-col items-center min-h-screen bg-neutral-950 text-white font-sans selection:bg-green-500 selection:text-black pb-20 md:pb-0">
            <ControlHeader {...{ zoom, setZoom, zoomRange, isZoomSupported, handleZoom, takeSnapshot, testAudio, isAudioEnabled, toggleCamera, resetStats, currentTab, setCurrentTab, gameMode, toggleGameMode, isPlaying, startGame, timeLeft }} />
            
            {currentTab === 'train' ? (
                <div className="flex flex-col lg:flex-row gap-6 w-[95%] max-w-6xl mt-6 pb-10">
                    <div className="relative bg-black rounded-3xl overflow-hidden shadow-2xl shadow-black border border-white/10 lg:w-3/4 aspect-video group flex justify-center items-center">
                        {isLoading && ( <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-neutral-900/90 backdrop-blur-md"><div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div><div className="text-xl font-bold mt-6 tracking-widest text-white">{loadingStatus}</div>{errorMsg && <div className="text-red-400 mt-4 bg-red-950/50 px-6 py-3 rounded-lg font-mono text-sm shadow-lg">{errorMsg}</div>}</div> )}
                        {gameMode === 'challenge' && timeLeft === 0 && ( <div className="absolute inset-0 z-30 bg-black/80 flex flex-col items-center justify-center backdrop-blur-sm animate-in fade-in zoom-in"><Trophy className="w-24 h-24 text-yellow-400 mb-4 drop-shadow-[0_0_30px_rgba(250,204,21,0.6)]" /><h2 className="text-4xl font-black text-white mb-2">TIME'S UP!</h2><div className="text-8xl font-black text-yellow-500 font-mono">{lungeCount}</div><button onClick={resetStats} className="mt-8 px-8 py-3 bg-white text-black font-bold rounded-full">Retry</button></div> )}
                        
                        <video ref={videoRef} className={`absolute w-full h-full object-contain ${facingMode === 'user' ? 'transform scale-x-[-1]' : ''}`} playsInline muted />
                        <canvas ref={canvasRef} className={`absolute w-full h-full object-contain z-10 ${facingMode === 'user' ? 'transform scale-x-[-1]' : ''}`} />
                        
                         <div className="absolute top-6 left-6 flex flex-col gap-3 pointer-events-none z-20"><div className="flex gap-2"><div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-[10px] text-neutral-400 uppercase">CAM: {facingMode === 'user' ? 'FRONT' : 'REAR'}</div>{!isAudioEnabled && (<div className="bg-red-500/20 backdrop-blur-md px-3 py-1.5 rounded-lg border border-red-500/50 text-[10px] text-red-400 flex items-center gap-2 animate-pulse"><VolumeX className="w-3 h-3" /> AUDIO MUTED</div>)}</div></div>
                         <div className="absolute top-6 right-6 pointer-events-none z-20"><div className="flex items-center gap-2 bg-red-500/20 backdrop-blur-md px-3 py-1.5 rounded-lg border border-red-500/30"><div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></div><span className="text-[10px] font-bold text-red-400 tracking-widest">LIVE ANALYTICS</span></div></div>

                    </div>
                    <LiveFeedback {...{ lungeCount, leftKneeAngle, rightKneeAngle, trunkAngle, postureFeedback, bestLunge, feedback, gameMode, ghostTarget }} />
                </div>
            ) : (
                <AnalysisDashboard history={history} setHistory={setHistory} />
            )}
            <footer className="w-full text-center py-6 border-t border-white/5 bg-black/20 fixed bottom-0"><p className="text-neutral-500 text-xs font-mono tracking-widest">AI POWERED SQUASH ANALYTICS • SYSTEM ACTIVE</p></footer>
        </div>
    );
};

export default SquashAnalysis;
