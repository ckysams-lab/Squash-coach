// 版本 1.2 - 支援行動裝置與鏡頭切換
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, Activity, Trophy, Move, RotateCcw, RefreshCw } from 'lucide-react';

const SquashAnalysis = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const poseRef = useRef(null); // Ref to hold the pose instance
  const drawingUtilsRef = useRef(null);

  // --- 狀態管理 ---
  const [leftKneeAngle, setLeftKneeAngle] = useState(0);
  const [rightKneeAngle, setRightKneeAngle] = useState(0);
  const [trunkAngle, setTrunkAngle] = useState(0);
  
  const [lungeCount, setLungeCount] = useState(0);
  const [bestLunge, setBestLunge] = useState(180);
  const [isLunging, setIsLunging] = useState(false);
  
  const [feedback, setFeedback] = useState("請站在鏡頭前...");
  const [postureFeedback, setPostureFeedback] = useState("背部狀態偵測中");
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState("正在初始化系統...");
  const [errorMsg, setErrorMsg] = useState("");

  // --- 相機控制狀態 ---
  const [videoDevices, setVideoDevices] = useState([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);

  // --- 輔助函數 ---
  // (calculateAngle, calculateVerticalAngle 函數保持不變)
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

  const switchCamera = () => {
    if (videoDevices.length > 1) {
      const nextIndex = (currentCameraIndex + 1) % videoDevices.length;
      setCurrentCameraIndex(nextIndex);
      setFeedback("切換鏡頭...");
    }
  };

  // --- 核心分析邏輯 ---
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
    
    const { drawConnectors, drawLandmarks, POSE_CONNECTIONS } = drawingUtilsRef.current;

    if (results.poseLandmarks) {
        const landmarks = results.poseLandmarks;
        // ... (原有的角度計算、狀態機、繪圖邏輯完全複製到這裡，保持不變)
        const l_shoulder = landmarks[11], l_hip = landmarks[23], l_knee = landmarks[25], l_ankle = landmarks[27];
        const r_shoulder = landmarks[12], r_hip = landmarks[24], r_knee = landmarks[26], r_ankle = landmarks[28];
        
        const l_angle = calculateAngle(l_hip, l_knee, l_ankle);
        const r_angle = calculateAngle(r_hip, r_knee, r_ankle);
        
        const activeSide = l_angle < r_angle ? 'left' : 'right';
        const activeKneeAngle = activeSide === 'left' ? l_angle : r_angle;
        
        const currentTrunkAngle = activeSide === 'left' ? calculateVerticalAngle(l_shoulder, l_hip) : calculateVerticalAngle(r_shoulder, r_hip);

        setLeftKneeAngle(l_angle);
        setRightKneeAngle(r_angle);
        setTrunkAngle(currentTrunkAngle);
        
        const isGoodLunge = activeKneeAngle < 100;
        
        if (activeKneeAngle < 150) setBestLunge(prev => Math.min(prev, activeKneeAngle));

        setIsLunging(prevIsLunging => {
            if (isGoodLunge && !prevIsLunging) {
                setLungeCount(prevCount => prevCount + 1);
                setFeedback("Good Lunge! +1");
                return true;
            } else if (activeKneeAngle > 140 && prevIsLunging) {
                setFeedback("準備下一次...");
                return false;
            }
            return prevIsLunging;
        });
        
        if (currentTrunkAngle > 30) setPostureFeedback("⚠️ 背部太前傾！");
        else if (currentTrunkAngle < 10) setPostureFeedback("✅ 背部挺直");
        else setPostureFeedback("背部角度正常");

        let skeletonColor = '#FFFFFF';
        if (activeKneeAngle < 100) skeletonColor = '#00FF00';
        if (currentTrunkAngle > 35) skeletonColor = '#FF0000';
        
        if (drawConnectors && POSE_CONNECTIONS) drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: skeletonColor, lineWidth: 4 });
        if (drawLandmarks) drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#FFFF00', lineWidth: 2, radius: 4 });
        
        const drawTextWithStroke = (text, x, y) => { canvasCtx.strokeText(text, x, y); canvasCtx.fillText(text, x, y); };
        canvasCtx.font = "bold 30px Arial";
        canvasCtx.fillStyle = "white";
        canvasCtx.strokeStyle = "black";
        canvasCtx.lineWidth = 2;
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
  }, []);

  // --- 初始化 MediaPipe ---
  useEffect(() => {
    const loadScript = (src) => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.crossOrigin = "anonymous";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`無法載入腳本: ${src}`));
        document.body.appendChild(script);
    });

    const initMediaPipe = async () => {
        setLoadingStatus("載入 AI 核心模組...");
        try {
            await Promise.all([
                loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js"),
                loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js")
            ]);

            if (window.drawingUtils) {
                drawingUtilsRef.current = {
                    drawConnectors: window.drawConnectors,
                    drawLandmarks: window.drawLandmarks,
                    POSE_CONNECTIONS: window.POSE_CONNECTIONS
                };
            }

            setLoadingStatus("啟動模型 (首次載入需約10秒)...");
            const pose = new window.Pose({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
            });
            pose.setOptions({
                modelComplexity: 1,
                smoothLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5,
            });
            pose.onResults(onResults);
            poseRef.current = pose;

            setLoadingStatus("偵測可用的攝影機...");
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoInputDevices = devices.filter(device => device.kind === 'videoinput');
            if (videoInputDevices.length === 0) {
                throw new Error("找不到任何攝影機裝置。");
            }
            setVideoDevices(videoInputDevices);
        } catch (error) {
            console.error(error);
            setErrorMsg(`初始化失敗: ${error.message}`);
            setIsLoading(false);
        }
    };
    initMediaPipe();
  }, [onResults]);

  // --- 核心相機與分析循環 ---
  useEffect(() => {
      if (videoDevices.length === 0 || !poseRef.current) return;

      const videoElement = videoRef.current;
      let stream;

      const startCamera = async () => {
          setIsLoading(true);
          setLoadingStatus("啟動相機...");
          
          // Stop any existing stream
          if (videoElement.srcObject) {
              videoElement.srcObject.getTracks().forEach(track => track.stop());
          }

          const constraints = {
              video: {
                  deviceId: videoDevices[currentCameraIndex].deviceId,
                  width: { ideal: 640 },
                  height: { ideal: 480 }
              }
          };

          try {
              stream = await navigator.mediaDevices.getUserMedia(constraints);
              videoElement.srcObject = stream;
              videoElement.play();
          } catch (err) {
              console.error("無法啟動相機:", err);
              setErrorMsg(`無法啟動相機: ${err.message}. 請檢查權限。`);
              setIsLoading(false);
          }
      };

      startCamera();

      const onFrame = async () => {
          if (videoElement.readyState >= 3) { // Ensure video is ready to be processed
              await poseRef.current.send({ image: videoElement });
          }
          if (videoElement.srcObject) { // if stream is still active
            requestAnimationFrame(onFrame);
          }
      };

      videoElement.onloadeddata = () => {
          setLoadingStatus("");
          setIsLoading(false);
          requestAnimationFrame(onFrame);
      };

      return () => {
          if (videoElement.srcObject) {
              videoElement.srcObject.getTracks().forEach(track => track.stop());
              videoElement.srcObject = null;
          }
      };
  }, [currentCameraIndex, videoDevices]);

  return (
    <div className="flex flex-col items-center min-h-screen bg-slate-900 text-white p-4 font-sans">
      <header className="mb-6 text-center w-full max-w-6xl flex justify-between items-center bg-slate-800 p-4 rounded-xl shadow-lg border border-slate-700">
        <div className="flex items-center gap-3">
          <div className="bg-green-500 p-2 rounded-lg"><Camera className="w-6 h-6 text-white" /></div>
          <div>
            <h1 className="text-2xl font-bold text-white">AI 壁球教練</h1>
            <p className="text-slate-400 text-sm">Pro Squash Analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
            {/* 新增的鏡頭切換按鈕 */}
            {videoDevices.length > 1 && (
                <button
                    onClick={switchCamera}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors text-sm font-medium"
                    aria-label="Switch Camera"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            )}
            <button 
                onClick={resetStats}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-sm font-medium"
            >
                <RotateCcw className="w-4 h-4" /> 重置
            </button>
        </div>
      </header>
      
      {/* --- 主內容區 --- */}
      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-6xl">
        <div className="relative bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-700 lg:w-3/4 aspect-video">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-slate-900 bg-opacity-95 backdrop-blur-sm">
              <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mb-6"></div>
              <div className="text-xl font-medium animate-pulse text-green-400">{loadingStatus}</div>
              <div className="text-slate-500 mt-2 text-sm">請允許瀏覽器使用相機權限</div>
              {errorMsg && <div className="text-red-500 mt-4 bg-red-900/20 px-4 py-2 rounded-lg border border-red-500/50">{errorMsg}</div>}
            </div>
          )}
          <video ref={videoRef} className="absolute top-0 left-0 w-full h-full object-cover transform scale-x-[-1] opacity-60" playsInline muted />
          <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full object-cover z-10 transform scale-x-[-1]" />
        </div>
        
        {/* --- 數據儀表板 --- */}
        <div className="flex flex-col gap-4 lg:w-1/4">
            {/* (此處 JSX 程式碼與原版相同，故省略，直接複製貼上即可) */}
            <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10"><Activity size={80} /></div>
                <h3 className="text-slate-400 text-sm font-medium mb-1 uppercase tracking-wider">Lunge Reps</h3>
                <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold text-white">{lungeCount}</span>
                <span className="text-sm text-green-400">次</span>
                </div>
                <div className="mt-2 text-xs text-slate-500">標準下蹲次數統計</div>
            </div>
            <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-lg space-y-4">
                <h3 className="text-white font-bold flex items-center gap-2"><Move className="w-4 h-4 text-blue-400" /> 即時動作數據</h3>
                <div>
                <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-300">Left Knee</span>
                    <span className={leftKneeAngle < 100 ? "text-green-400 font-bold" : "text-slate-400"}>{leftKneeAngle}°</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-300 ${leftKneeAngle < 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${Math.min((180 - leftKneeAngle) / 90 * 100, 100)}%` }}></div>
                </div>
                </div>
                <div>
                <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-300">Right Knee</span>
                    <span className={rightKneeAngle < 100 ? "text-green-400 font-bold" : "text-slate-400"}>{rightKneeAngle}°</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-300 ${rightKneeAngle < 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${Math.min((180 - rightKneeAngle) / 90 * 100, 100)}%` }}></div>
                </div>
                </div>
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
            <div className="bg-gradient-to-br from-green-900 to-slate-800 p-5 rounded-xl border border-green-800/50 shadow-lg text-center">
                <div className="flex justify-center mb-2"><Trophy className="w-8 h-8 text-yellow-400" /></div>
                <div className="text-sm text-green-200/80 mb-1">本次最佳深度 (Best Depth)</div>
                <div className="text-3xl font-bold text-white mb-2">{bestLunge === 180 ? '--' : bestLunge}°</div>
                <div className="bg-black/30 rounded-lg p-2 text-sm text-green-300 font-medium">{feedback}</div>
            </div>
        </div>
      </div>
      
      <footer className="mt-8 text-slate-500 text-sm max-w-4xl text-center">
        <p>💡 使用說明：請將攝影機放置於側面或斜前方，確保全身入鏡。點擊 <RefreshCw className="inline-block w-3 h-3" /> 按鈕可切換前後鏡頭。</p>
      </footer>
    </div>
  );
};

export default SquashAnalysis;
