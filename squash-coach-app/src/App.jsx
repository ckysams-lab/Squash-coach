// 版本 1.2.1 - 強化相機串流管理與使用者體驗
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, Activity, Trophy, Move, RotateCcw, RefreshCw } from 'lucide-react';

const SquashAnalysis = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const poseRef = useRef(null);
  const drawingUtilsRef = useRef(null);
  const streamRef = useRef(null); // Ref to hold the current stream

  // --- 狀態管理 ---
  const [leftKneeAngle, setLeftKneeAngle] = useState(0);
  // ... (其他核心數據狀態不變)
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

  const [videoDevices, setVideoDevices] = useState([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);

  // --- 輔助函數 --- (calculateAngle, calculateVerticalAngle, resetStats 保持不變)
  const calculateAngle = (a, b, c) => { /* ... */ return Math.round(angle); };
  const calculateVerticalAngle = (a, b) => { /* ... */ return Math.round(Math.abs(90 - angle)); };
  const resetStats = () => { /* ... */ };

  // --- 改良後的鏡頭切換函數 ---
  const switchCamera = () => {
    if (videoDevices.length <= 1 || isLoading) return; // 防止在載入時重複點擊

    setLoadingStatus("正在切換鏡頭...");
    setIsLoading(true);

    // 立即停止當前的串流，這是最關鍵的改動
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
    }

    const nextIndex = (currentCameraIndex + 1) % videoDevices.length;
    setCurrentCameraIndex(nextIndex);
  };
  
  // --- 核心分析邏輯 --- (onResults 保持不變)
  const onResults = useCallback((results) => {
    // ... (所有繪圖和分析邏輯完全不變)
    setIsLoading(false); // 確保在收到結果後關閉 loading
  }, []);

  // --- 初始化 MediaPipe --- (此 useEffect 保持不變)
  useEffect(() => {
    // ... (載入腳本、初始化 Pose 模型的邏輯完全不變)
  }, [onResults]);

  // --- 核心相機與分析循環 (最重要的修改部分) ---
  useEffect(() => {
      if (videoDevices.length === 0 || !poseRef.current) return;

      const videoElement = videoRef.current;
      let animationFrameId = null;

      const startCameraAndAnalysis = async () => {
          // 確保之前的串流徹底關閉
          if (streamRef.current) {
              streamRef.current.getTracks().forEach(track => track.stop());
          }

          setIsLoading(true);
          if (!loadingStatus.includes("切換")) {
            setLoadingStatus("啟動相機...");
          }
          
          const constraints = {
              video: {
                  deviceId: { exact: videoDevices[currentCameraIndex].deviceId },
                  width: { ideal: 640 },
                  height: { ideal: 480 }
              }
          };

          try {
              const stream = await navigator.mediaDevices.getUserMedia(constraints);
              streamRef.current = stream; // 將新的 stream 儲存到 Ref
              videoElement.srcObject = stream;
              
              videoElement.onloadedmetadata = () => {
                videoElement.play();
                const onFrame = async () => {
                    if (videoElement.readyState >= 3) {
                        await poseRef.current.send({ image: videoElement });
                    }
                    // 只要 component 還在，就繼續下一幀
                    animationFrameId = requestAnimationFrame(onFrame);
                };
                onFrame();
              };
          } catch (err) {
              console.error("無法啟動相機:", err);
              setErrorMsg(`無法啟動相機: ${err.message}. 請檢查權限。`);
              setIsLoading(false);
          }
      };

      startCameraAndAnalysis();

      // --- 這是至關重要的清理函數 ---
      return () => {
          cancelAnimationFrame(animationFrameId);
          if (streamRef.current) {
              streamRef.current.getTracks().forEach(track => track.stop());
              streamRef.current = null;
          }
          if(videoElement && videoElement.srcObject){
            videoElement.srcObject.getTracks().forEach(track => track.stop());
            videoElement.srcObject = null;
          }
      };
  }, [currentCameraIndex, videoDevices, loadingStatus]); // 保持依賴項

  // --- UI 渲染 --- (JSX 結構與 1.2 版相同)
  return (
    <div className="flex flex-col items-center min-h-screen bg-slate-900 text-white p-4 font-sans">
        {/* ... Header ... */}
        {/* ... 主內容區 ... */}
        {/* ... 數據儀表板 ... */}
        {/* ... Footer ... */}
    </div>
  );
};

export default SquashAnalysis;
