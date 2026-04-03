// 版本 1.1 - 修正繪圖工具和 useCallback 效能問題
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, Activity, Trophy, Move, RotateCcw } from 'lucide-react';

const SquashAnalysis = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const drawingUtilsRef = useRef(null); // <--- 新增 Ref 來儲存 drawing_utils

  // --- 狀態管理 ---
  // 核心數據
  const [leftKneeAngle, setLeftKneeAngle] = useState(0);
  const [rightKneeAngle, setRightKneeAngle] = useState(0);
  const [trunkAngle, setTrunkAngle] = useState(0);
  
  // 訓練統計
  const [lungeCount, setLungeCount] = useState(0);
  const [bestLunge, setBestLunge] = useState(180); // 越低越好，預設 180
  const [isLunging, setIsLunging] = useState(false); // 狀態機：是否處於下蹲狀態
  
  // 系統狀態
  const [feedback, setFeedback] = useState("請站在鏡頭前...");
  const [postureFeedback, setPostureFeedback] = useState("背部狀態偵測中");
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState("正在初始化系統...");
  const [errorMsg, setErrorMsg] = useState("");

  // --- 輔助函數 ---
  const loadScript = (src) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`無法載入腳本: ${src}`));
      document.body.appendChild(script);
    });
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

  const resetStats = () => {
    setLungeCount(0);
    setBestLunge(180);
    setIsLunging(false);
    setFeedback("數據已重置");
  };

  // --- 核心邏輯 Loop ---
  const onResults = useCallback((results) => {
    if (!canvasRef.current || !videoRef.current || !drawingUtilsRef.current) return;

    const videoWidth = videoRef.current.videoWidth;
    const videoHeight = videoRef.current.videoHeight;
    if (videoWidth === 0 || videoHeight === 0) return;

    canvasRef.current.width = videoWidth;
    canvasRef.current.height = videoHeight;
    const canvasCtx = canvasRef.current.getContext('2d');
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, videoWidth, videoHeight);
    
    const { drawConnectors, drawLandmarks, POSE_CONNECTIONS } = drawingUtilsRef.current; // <--- 從 Ref 中獲取繪圖工具

    if (results.poseLandmarks) {
      const landmarks = results.poseLandmarks;
      // 1. 提取關鍵點
      const l_shoulder = landmarks[11];
      const l_hip = landmarks[23];
      const l_knee = landmarks[25];
      const l_ankle = landmarks[27];
      const r_shoulder = landmarks[12];
      const r_hip = landmarks[24];
      const r_knee = landmarks[26];
      const r_ankle = landmarks[28];
      
      // 2. 計算角度
      const l_angle = calculateAngle(l_hip, l_knee, l_ankle);
      const r_angle = calculateAngle(r_hip, r_knee, r_ankle);
      
      const activeSide = l_angle < r_angle ? 'left' : 'right';
      const activeKneeAngle = activeSide === 'left' ? l_angle : r_angle;
      
      const currentTrunkAngle = activeSide === 'left' 
        ? calculateVerticalAngle(l_shoulder, l_hip) 
        : calculateVerticalAngle(r_shoulder, r_hip);

      setLeftKneeAngle(l_angle);
      setRightKneeAngle(r_angle);
      setTrunkAngle(currentTrunkAngle);
      
      // 3. 邏輯判斷與狀態機
      const isGoodLunge = activeKneeAngle < 100;
      
      if (activeKneeAngle < 150) { 
        setBestLunge(prev => Math.min(prev, activeKneeAngle));
      }

      // 使用函數式更新來避免 stale state
      setIsLunging(prevIsLunging => {
        if (isGoodLunge && !prevIsLunging) {
          setLungeCount(prevCount => prevCount + 1);
          setFeedback("Good Lunge! +1");
          return true; // 進入下蹲狀態
        } else if (activeKneeAngle > 140 && prevIsLunging) {
          setFeedback("準備下一次...");
          return false; // 回到站立狀態
        }
        return prevIsLunging; // 保持當前狀態
      });
      
      if (currentTrunkAngle > 30) {
        setPostureFeedback("⚠️ 背部太前傾！");
      } else if (currentTrunkAngle < 10) {
        setPostureFeedback("✅ 背部挺直");
      } else {
        setPostureFeedback("背部角度正常");
      }

      // 4. 繪製骨架 (視覺優化)
      let skeletonColor = '#FFFFFF';
      if (activeKneeAngle < 100) skeletonColor = '#00FF00';
      if (currentTrunkAngle > 35) skeletonColor = '#FF0000';
      
      if (drawConnectors && POSE_CONNECTIONS) {
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: skeletonColor, lineWidth: 4 });
      }
      
      if (drawLandmarks) {
        drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#FFFF00', lineWidth: 2, radius: 4 });
      }
      
      // 5. 繪製數據覆蓋層
      canvasCtx.font = "bold 30px Arial";
      canvasCtx.fillStyle = "white";
      canvasCtx.strokeStyle = "black";
      canvasCtx.lineWidth = 2;
      const drawTextWithStroke = (text, x, y) => {
        canvasCtx.strokeText(text, x, y);
        canvasCtx.fillText(text, x, y);
      };
      if (l_knee) drawTextWithStroke(`${l_angle}°`, l_knee.x * videoWidth, l_knee.y * videoHeight);
      if (r_knee) drawTextWithStroke(`${r_angle}°`, r_knee.x * videoWidth, r_knee.y * videoHeight);
      
      if (isGoodLunge) {
        canvasCtx.font = "bold 50px Arial";
        canvasCtx.fillStyle = "#00FF00";
        canvasCtx.textAlign = "center";
        canvasCtx.fillText("LUNGE!", videoWidth / 2, 80);
      }
    }
    canvasCtx.restore();
    setIsLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // <--- 移除依賴項，確保函數只創建一次

  // --- 初始化 ---
  useEffect(() => {
    let camera = null;
    let pose = null;
    
    const initMediaPipe = async () => {
      try {
        setLoadingStatus("載入 AI 核心模組...");
        await Promise.all([
            loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js"),
            loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js"),
            loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js")
        ]);

        // <--- 將繪圖工具儲存到 Ref 中
        if (window.drawingUtils && window.POSE_CONNECTIONS) {
            drawingUtilsRef.current = {
                drawConnectors: window.drawConnectors,
                drawLandmarks: window.drawLandmarks,
                POSE_CONNECTIONS: window.POSE_CONNECTIONS
            };
        }

        setLoadingStatus("啟動模型 (首次載入需約10秒)...");
        
        if (window.Pose) {
          pose = new window.Pose({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
          });
          pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            enableSegmentation: false,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
          pose.onResults(onResults);
          
          // <--- 確保 Camera 和 videoRef 已準備好
          if (videoRef.current && window.Camera) {
            camera = new window.Camera(videoRef.current, {
              onFrame: async () => {
                if (videoRef.current) {
                  await pose.send({ image: videoRef.current });
                }
              },
              width: 640,
              height: 480,
            });
            await camera.start();
            setLoadingStatus("");
          }
        }
      } catch (error) {
        console.error(error);
        setErrorMsg("載入失敗，請檢查網路連線或重新整理頁面。");
        setIsLoading(false);
      }
    };
    initMediaPipe();
    
    return () => {
      if (camera) camera.stop();
      if (pose) pose.close();
    };
  }, [onResults]);

  // --- UI 渲染 ---
  // (此處 JSX 程式碼與原版相同，故省略)
  return (
    <div className="flex flex-col items-center min-h-screen bg-slate-900 text-white p-4 font-sans">
      <header className="mb-6 text-center w-full max-w-6xl flex justify-between items-center bg-slate-800 p-4 rounded-xl shadow-lg border border-slate-700">
        <div className="flex items-center gap-3">
          <div className="bg-green-500 p-2 rounded-lg">
            <Camera className="w-6 h-6 text-white" />
          </div>
          <div className="text-left">
            <h1 className="text-2xl font-bold text-white">AI 壁球教練</h1>
            <p className="text-slate-400 text-sm">Pro Squash Analysis</p>
          </div>
        </div>
        <button 
          onClick={resetStats}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-sm font-medium"
        >
          <RotateCcw className="w-4 h-4" /> 重置數據
        </button>
      </header>
      {/* 主內容區 */}
      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-6xl">
        
        {/* 左側：影像顯示區 */}
        <div className="relative bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-700 lg:w-3/4 aspect-video group">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-slate-900 bg-opacity-95 backdrop-blur-sm">
              <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mb-6"></div>
              <div className="text-xl font-medium animate-pulse text-green-400">{loadingStatus}</div>
              <div className="text-slate-500 mt-2 text-sm">請允許瀏覽器使用相機權限</div>
              {errorMsg && <div className="text-red-500 mt-4 bg-red-900/20 px-4 py-2 rounded-lg border border-red-500/50">{errorMsg}</div>}
            </div>
          )}
          
          <video
            ref={videoRef}
            className="absolute top-0 left-0 w-full h-full object-cover transform scale-x-[-1] opacity-60"
            playsInline
            muted
          />
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full object-cover z-10 transform scale-x-[-1]"
          />
          
          {/* 浮動提示 */}
          <div className="absolute top-4 left-4 bg-black/60 backdrop-blur px-3 py-1 rounded-full border border-white/10 text-xs text-white/80">
            AI 視覺運算中 • 60 FPS
          </div>
        </div>
        {/* 右側：專業數據儀表板 */}
        <div className="flex flex-col gap-4 lg:w-1/4">
          
          {/* 1. 計數卡片 */}
          <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Activity size={80} />
            </div>
            <h3 className="text-slate-400 text-sm font-medium mb-1 uppercase tracking-wider">Lunge Reps</h3>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold text-white">{lungeCount}</span>
              <span className="text-sm text-green-400">次</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">標準下蹲次數統計</div>
          </div>
          {/* 2. 角度詳細數據 */}
          <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-lg space-y-4">
            <h3 className="text-white font-bold flex items-center gap-2">
              <Move className="w-4 h-4 text-blue-400" /> 即時動作數據
            </h3>
            
            {/* 左膝 */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-300">Left Knee</span>
                <span className={leftKneeAngle < 100 ? "text-green-400 font-bold" : "text-slate-400"}>{leftKneeAngle}°</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${leftKneeAngle < 100 ? 'bg-green-500' : 'bg-blue-500'}`} 
                  style={{ width: `${Math.min((180 - leftKneeAngle) / 90 * 100, 100)}%` }}
                ></div>
              </div>
            </div>
            {/* 右膝 */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-300">Right Knee</span>
                <span className={rightKneeAngle < 100 ? "text-green-400 font-bold" : "text-slate-400"}>{rightKneeAngle}°</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${rightKneeAngle < 100 ? 'bg-green-500' : 'bg-blue-500'}`} 
                  style={{ width: `${Math.min((180 - rightKneeAngle) / 90 * 100, 100)}%` }}
                ></div>
              </div>
            </div>
             {/* 背部 */}
             <div className="pt-2 border-t border-slate-700">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-300">Back Lean</span>
                <span className={trunkAngle > 30 ? "text-red-400 font-bold" : "text-green-400"}>{trunkAngle}°</span>
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className={`${trunkAngle > 30 ? 'text-red-400' : 'text-slate-500'}`}>{postureFeedback}</span>
              </div>
            </div>
          </div>
          {/* 3. 最佳紀錄 & 回饋 */}
          <div className="bg-gradient-to-br from-green-900 to-slate-800 p-5 rounded-xl border border-green-800/50 shadow-lg text-center">
            <div className="flex justify-center mb-2">
              <Trophy className="w-8 h-8 text-yellow-400" />
            </div>
            <div className="text-sm text-green-200/80 mb-1">本次最佳深度 (Best Depth)</div>
            <div className="text-3xl font-bold text-white mb-2">
              {bestLunge === 180 ? '--' : bestLunge}°
            </div>
            <div className="bg-black/30 rounded-lg p-2 text-sm text-green-300 font-medium">
              {feedback}
            </div>
          </div>
        </div>
      </div>
      
      {/* 底部說明 */}
      <footer className="mt-8 text-slate-500 text-sm max-w-4xl text-center">
        <p>💡 使用說明：請將攝影機放置於側面或斜前方，確保全身入鏡。系統會自動計算深蹲次數與動作品質。</p>
      </footer>
    </div>
  );
};
export default SquashAnalysis;
