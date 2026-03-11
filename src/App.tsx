import React, { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { Trophy, Shield, Zap, Magnet, Star, AlertTriangle, Waves, Pause, List } from "lucide-react";

// Types
type Player = {
  id: string;
  name: string;
  boatType: "speedster" | "collector" | "guardian";
  x: number;
  y: number;
  rotation: number;
  score: number;
  combo: number;
  invincibleUntil: number;
  activePowerups: {
    magnet: number;
    speed: number;
    shield: number;
    multiplier: number;
  };
};

type Item = {
  id: string;
  type: string;
  x: number;
  y: number;
  category: "garbage" | "hazard" | "powerup";
  value: number;
};

type GameState = {
  players: Record<string, Player>;
  items: Record<string, Item>;
  gameState: "waiting" | "playing" | "leaderboard";
  timeLeft: number;
};

const MAP_SIZE = 2000;

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [name, setName] = useState("");
  const [boatType, setBoatType] = useState<"speedster" | "collector" | "guardian">("guardian");
  const [joined, setJoined] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [joystick, setJoystick] = useState({ active: false, angle: 0, x: 0, y: 0 });
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keys = useRef({ up: false, left: false, right: false });
  const gameStateRef = useRef<GameState | null>(null);
  const joystickRef = useRef({ active: false, angle: 0 });

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    const newSocket = io(window.location.origin);
    setSocket(newSocket);

    newSocket.on("init", (data) => {
      setMyId(data.id);
    });

    newSocket.on("state", (state: GameState) => {
      setGameState(state);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "w") keys.current.up = true;
      if (e.key === "ArrowLeft" || e.key === "a") keys.current.left = true;
      if (e.key === "ArrowRight" || e.key === "d") keys.current.right = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "w") keys.current.up = false;
      if (e.key === "ArrowLeft" || e.key === "a") keys.current.left = false;
      if (e.key === "ArrowRight" || e.key === "d") keys.current.right = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    if (!socket || !joined) return;
    const interval = setInterval(() => {
      socket.emit("input", { 
        ...keys.current,
        angle: joystickRef.current.angle,
        active: joystickRef.current.active
      });
    }, 50);
    return () => clearInterval(interval);
  }, [socket, joined]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !joined) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      animationFrameId = requestAnimationFrame(render);
      const state = gameStateRef.current;
      if (!state || !myId) return;
      const me = state.players[myId];
      if (!me) return;

      if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }

      const time = Date.now() / 1000;

      // Clear canvas with bright cyan water
      ctx.fillStyle = "#00bfff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Camera offset
      const cx = me.x - canvas.width / 2;
      const cy = me.y - canvas.height / 2;

      // Draw animated water waves (stylized)
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 1.5;
      const waveSpacing = 150;
      const offsetX = cx % waveSpacing;
      const offsetY = cy % waveSpacing;

      for (let y = -waveSpacing; y < canvas.height + waveSpacing; y += waveSpacing) {
        ctx.beginPath();
        for (let x = -waveSpacing; x < canvas.width + waveSpacing; x += 30) {
          const worldX = x + cx;
          const waveY = y - offsetY + Math.sin(worldX / 80 + time) * 20;
          if (x === -waveSpacing) ctx.moveTo(x - offsetX, waveY);
          else ctx.quadraticCurveTo(x - offsetX - 15, waveY + 10, x - offsetX, waveY);
        }
        ctx.stroke();
      }

      // Draw faint palm tree shadows (as seen in reference)
      ctx.fillStyle = "rgba(0, 150, 200, 0.15)";
      for (let i = 0; i < 10; i++) {
        const px = (i * 400 + 200) - cx;
        const py = (i * 300 + 100) - cy;
        if (px > -200 && px < canvas.width + 200 && py > -200 && py < canvas.height + 200) {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(i);
          for (let j = 0; j < 8; j++) {
            ctx.rotate(Math.PI / 4);
            ctx.beginPath();
            ctx.ellipse(40, 0, 40, 10, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      // Draw beach at bottom of map
      const beachY = MAP_SIZE - cy;
      if (beachY < canvas.height + 200) {
        ctx.fillStyle = "#fde047"; // Sand
        ctx.beginPath();
        ctx.moveTo(0, beachY);
        for (let x = 0; x <= canvas.width; x += 50) {
          ctx.lineTo(x, beachY + Math.sin((x + cx) / 100) * 20);
        }
        ctx.lineTo(canvas.width, canvas.height);
        ctx.lineTo(0, canvas.height);
        ctx.fill();

        // White foam
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 10;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(0, beachY);
        for (let x = 0; x <= canvas.width; x += 50) {
          ctx.lineTo(x, beachY + Math.sin((x + cx) / 100) * 20 - 5);
        }
        ctx.stroke();
      }

      // Draw items
      (Object.values(state.items) as Item[]).forEach(item => {
        const ix = item.x - cx;
        const iy = item.y - cy;

        if (ix < -50 || ix > canvas.width + 50 || iy < -50 || iy > canvas.height + 50) return;

        ctx.save();
        ctx.translate(ix, iy);
        
        const floatOffset = Math.sin(time * 2 + item.x) * 4;
        ctx.translate(0, floatOffset);
        ctx.rotate(item.id.length); // Random static rotation

        if (item.category === "garbage") {
          if (item.type === "plastic") {
            ctx.fillStyle = "#38bdf8";
            ctx.beginPath(); ctx.roundRect(-4, -10, 8, 20, 2); ctx.fill();
            ctx.fillStyle = "#0284c7"; ctx.fillRect(-2, -12, 4, 2);
            ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(-4, -2, 8, 6);
          } else if (item.type === "bag") {
            ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
            ctx.beginPath();
            ctx.moveTo(-8, -5); ctx.quadraticCurveTo(-10, 10, -5, 12);
            ctx.quadraticCurveTo(0, 15, 5, 12); ctx.quadraticCurveTo(10, 10, 8, -5);
            ctx.quadraticCurveTo(0, -2, -8, -5);
            ctx.fill();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.7)"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(-4, -5, 4, Math.PI, 0); ctx.stroke();
            ctx.beginPath(); ctx.arc(4, -5, 4, Math.PI, 0); ctx.stroke();
          } else if (item.type === "can") {
            ctx.fillStyle = "#ef4444";
            ctx.beginPath(); ctx.roundRect(-5, -8, 10, 16, 2); ctx.fill();
            ctx.fillStyle = "#cbd5e1";
            ctx.fillRect(-5, -8, 10, 2); ctx.fillRect(-5, 6, 10, 2);
          } else if (item.type === "oil") {
            ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
            ctx.beginPath();
            ctx.moveTo(0, -12); ctx.bezierCurveTo(10, -12, 15, -5, 12, 5);
            ctx.bezierCurveTo(10, 15, -5, 12, -10, 5); ctx.bezierCurveTo(-15, -5, -10, -12, 0, -12);
            ctx.fill();
            ctx.fillStyle = "rgba(168, 85, 247, 0.3)";
            ctx.beginPath(); ctx.ellipse(-2, -2, 6, 3, Math.PI/4, 0, Math.PI*2); ctx.fill();
          }
        } else if (item.category === "hazard") {
          if (item.type === "net") {
            ctx.strokeStyle = "#d4d4d8"; ctx.lineWidth = 1;
            ctx.beginPath();
            for(let i=-10; i<=10; i+=4) {
              ctx.moveTo(i, -10); ctx.lineTo(i, 10);
              ctx.moveTo(-10, i); ctx.lineTo(10, i);
            }
            ctx.stroke();
            ctx.fillStyle = "#ef4444";
            ctx.beginPath(); ctx.arc(-10, -10, 3, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(10, 10, 3, 0, Math.PI*2); ctx.fill();
          } else if (item.type === "rings") {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.6)"; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(-6, -4, 4, 0, Math.PI*2); ctx.stroke();
            ctx.beginPath(); ctx.arc(6, -4, 4, 0, Math.PI*2); ctx.stroke();
            ctx.beginPath(); ctx.arc(-6, 4, 4, 0, Math.PI*2); ctx.stroke();
            ctx.beginPath(); ctx.arc(6, 4, 4, 0, Math.PI*2); ctx.stroke();
          } else if (item.type === "tire") {
            ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 6;
            ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI*2); ctx.stroke();
          } else if (item.type === "toxic") {
            ctx.fillStyle = "#22c55e";
            ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = "#14532d"; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = "#000";
            ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0, 6, -Math.PI/6, Math.PI/6); ctx.fill();
            ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0, 6, Math.PI/2, 5*Math.PI/6); ctx.fill();
            ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0, 6, 7*Math.PI/6, 3*Math.PI/2); ctx.fill();
          }
        } else if (item.category === "powerup") {
          const colors = { magnet: "#a855f7", speed: "#eab308", shield: "#06b6d4", multiplier: "#f97316" };
          const color = colors[item.type as keyof typeof colors] || "#ffffff";
          ctx.shadowColor = color;
          ctx.shadowBlur = 15 + Math.sin(time * 5) * 5;
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = "#ffffff";
          ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
        }
        
        ctx.restore();
      });

      // Draw players
      (Object.values(state.players) as Player[]).forEach(p => {
        const px = p.x - cx;
        const py = p.y - cy;

        if (px < -100 || px > canvas.width + 100 || py < -100 || py > canvas.height + 100) return;

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate((p.rotation * Math.PI) / 180);

        // Draw wake
        if (state.gameState === "playing") {
          ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
          ctx.beginPath();
          ctx.moveTo(-15, 30);
          ctx.lineTo(-30 - Math.random()*5, 60);
          ctx.lineTo(30 + Math.random()*5, 60);
          ctx.lineTo(15, 30);
          ctx.fill();
        }

        // Draw boat (Yellow catamaran with blue solar panels)
        ctx.shadowColor = "rgba(0,0,0,0.3)";
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 10;
        
        // Pontoons
        ctx.fillStyle = "#fde047"; // Yellow
        ctx.beginPath(); ctx.roundRect(-20, -20, 8, 60, 4); ctx.fill();
        ctx.beginPath(); ctx.roundRect(12, -20, 8, 60, 4); ctx.fill();
        
        // Main body
        ctx.beginPath(); ctx.moveTo(-12, -30); ctx.lineTo(12, -30); ctx.lineTo(12, 30); ctx.lineTo(-12, 30); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-6, -45); ctx.lineTo(6, -45); ctx.lineTo(12, -30); ctx.lineTo(-12, -30); ctx.fill(); // Nose
        
        // Solar panels (Blue rectangles)
        ctx.shadowColor = "transparent";
        ctx.fillStyle = "#1d4ed8";
        ctx.fillRect(-10, -20, 8, 40);
        ctx.fillRect(2, -20, 8, 40);
        
        // Panel grid lines
        ctx.strokeStyle = "#fde047";
        ctx.lineWidth = 1;
        for(let i=-15; i<20; i+=8) {
          ctx.beginPath(); ctx.moveTo(-10, i); ctx.lineTo(-2, i); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(2, i); ctx.lineTo(10, i); ctx.stroke();
        }

        // Draw shield if active
        const now = Date.now();
        if (p.activePowerups.shield > now) {
          ctx.beginPath();
          ctx.arc(0, 0, 50, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(6, 182, 212, 0.8)";
          ctx.lineWidth = 4;
          ctx.stroke();
          ctx.fillStyle = "rgba(6, 182, 212, 0.2)";
          ctx.fill();
        }
        
        // Draw magnet if active
        if (p.activePowerups.magnet > now) {
          ctx.beginPath();
          ctx.arc(0, 0, 100, 0, Math.PI * 2); // default rad is 30, magnet is 3x
          ctx.strokeStyle = "rgba(168, 85, 247, 0.5)";
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 8]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Invincibility flashing
        if (p.invincibleUntil > now) {
           ctx.globalAlpha = Math.sin(time * 20) > 0 ? 0.5 : 1;
        }

        ctx.restore();
        ctx.globalAlpha = 1;

        // Draw name and score
        ctx.fillStyle = "white";
        ctx.font = "bold 16px Nunito, sans-serif";
        ctx.textAlign = "center";
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 4;
        if (p.id !== myId) {
          ctx.fillText(p.name, px, py - 60);
        }
        
        // Combo text
        if (p.combo > 1) {
          ctx.fillStyle = "#fde047";
          ctx.font = "bold 20px Fredoka, sans-serif";
          ctx.fillText(`${p.combo}x Combo!`, px, py - 80);
        }
        ctx.shadowBlur = 0;
      });

    };

    render();

    return () => cancelAnimationFrame(animationFrameId);
  }, [joined, myId]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !socket) return;
    socket.emit("join", { name, boatType });
    setJoined(true);
  };

  const handleTouch = (e: React.TouchEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const touch = e.targetTouches[0];
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = touch.clientX - cx;
    const dy = touch.clientY - cy;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const maxDist = rect.width / 2 - 24; // 24 is half knob width
    
    let nx = dx;
    let ny = dy;
    if (dist > maxDist) {
      nx = (dx / dist) * maxDist;
      ny = (dy / dist) * maxDist;
    }
    
    // Angle in degrees, 0 is UP
    const angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
    
    joystickRef.current = { active: true, angle };
    setJoystick({ active: true, angle, x: nx, y: ny });
  };

  const handleTouchEnd = () => {
    joystickRef.current = { active: false, angle: 0 };
    setJoystick({ active: false, angle: 0, x: 0, y: 0 });
  };

  if (!joined) {
    return (
      <div className="min-h-screen bg-[#00bfff] flex items-center justify-center p-4 relative overflow-hidden font-nunito">
        {/* Decorative background elements */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-10 left-10 w-64 h-64 bg-sky-300 rounded-full mix-blend-overlay filter blur-3xl animate-blob"></div>
          <div className="absolute top-0 right-10 w-64 h-64 bg-cyan-300 rounded-full mix-blend-overlay filter blur-3xl animate-blob animation-delay-2000"></div>
          <div className="absolute -bottom-8 left-20 w-64 h-64 bg-blue-300 rounded-full mix-blend-overlay filter blur-3xl animate-blob animation-delay-4000"></div>
        </div>

        <div className="bg-white/20 backdrop-blur-xl border border-white/30 rounded-3xl shadow-2xl p-8 max-w-md w-full text-center relative z-10">
          <div className="w-24 h-24 bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-full mx-auto mb-6 flex items-center justify-center shadow-lg border-4 border-white">
            <Waves className="w-12 h-12 text-blue-600" />
          </div>
          <h1 className="text-5xl font-black text-white mb-2 tracking-tight drop-shadow-md font-fredoka">OCEAN<br/>GUARDIAN</h1>
          <p className="text-sky-100 mb-8 font-bold text-lg">Clean the ocean, avoid hazards!</p>
          
          <form onSubmit={handleJoin} className="space-y-6">
            <div>
              <input
                type="text"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-5 py-4 rounded-2xl bg-white/30 border-2 border-white/50 text-white placeholder-white/70 focus:bg-white/40 focus:border-white focus:ring-4 focus:ring-white/30 outline-none transition-all text-xl font-bold text-center shadow-inner"
                maxLength={15}
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              {(["speedster", "collector", "guardian"] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setBoatType(type)}
                  className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${boatType === type ? 'bg-white/40 border-white shadow-lg scale-105' : 'bg-white/10 border-white/20 hover:bg-white/20'}`}
                >
                  <div className="w-10 h-10 bg-yellow-400 rounded-md border-2 border-blue-600 flex items-center justify-center">
                    {type === "speedster" && <Zap className="w-5 h-5 text-blue-800" />}
                    {type === "collector" && <Magnet className="w-5 h-5 text-blue-800" />}
                    {type === "guardian" && <Shield className="w-5 h-5 text-blue-800" />}
                  </div>
                  <span className="text-xs font-bold text-white capitalize">{type}</span>
                </button>
              ))}
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-b from-yellow-300 to-yellow-500 hover:from-yellow-200 hover:to-yellow-400 text-blue-900 font-black py-4 rounded-2xl shadow-[0_8px_0_#ca8a04] active:shadow-[0_0px_0_#ca8a04] active:translate-y-2 transition-all uppercase tracking-widest text-xl font-fredoka"
            >
              Play Now
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (gameState?.gameState === "leaderboard") {
    const sortedPlayers = (Object.values(gameState.players) as Player[]).sort((a, b) => b.score - a.score);
    return (
      <div className="min-h-screen bg-[#00bfff] flex items-center justify-center p-4 relative overflow-hidden font-nunito">
        <div className="bg-white/20 backdrop-blur-2xl border border-white/30 rounded-[2rem] shadow-2xl p-10 max-w-2xl w-full relative z-10">
          <div className="text-center mb-10">
            <h2 className="text-6xl font-black text-white uppercase tracking-tight drop-shadow-lg font-fredoka">Round Over!</h2>
            <p className="text-sky-100 mt-2 font-bold text-xl">Final Standings</p>
          </div>
          <div className="space-y-3">
            {sortedPlayers.slice(0, 10).map((p, i) => (
              <div key={p.id} className={`flex items-center justify-between p-4 rounded-2xl transition-all ${p.id === myId ? 'bg-white/40 border-2 border-yellow-400 shadow-lg transform scale-[1.02]' : 'bg-white/10 border border-white/20'}`}>
                <div className="flex items-center gap-5">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-xl shadow-inner ${i === 0 ? 'bg-yellow-400 text-yellow-900' : i === 1 ? 'bg-slate-300 text-slate-800' : i === 2 ? 'bg-amber-500 text-amber-100' : 'bg-white/20 text-white'}`}>
                    {i + 1}
                  </div>
                  <span className={`font-bold text-2xl ${p.id === myId ? 'text-white' : 'text-sky-100'}`}>{p.name}</span>
                </div>
                <div className="font-black text-3xl text-yellow-300 drop-shadow-md font-fredoka">{p.score}</div>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <div className="inline-flex items-center gap-3 px-6 py-3 bg-white/20 rounded-full border border-white/30 text-white font-bold text-lg">
              <div className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse"></div>
              Next round starting soon...
            </div>
          </div>
        </div>
      </div>
    );
  }

  const me = gameState?.players[myId || ""];
  const now = Date.now();

  return (
    <div className="fixed inset-0 bg-[#00bfff] overflow-hidden font-nunito">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0"
      />

      {/* HUD Overlay matching design reference */}
      <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
        <div className="bg-[#0ea5e9] border-b-4 border-[#0284c7] rounded-b-[2rem] px-6 py-4 flex justify-between items-center shadow-lg">
          
          {/* Score */}
          <div className="text-center pointer-events-auto">
            <div className="text-sm font-black text-[#075985] uppercase tracking-widest font-fredoka">Score</div>
            <div className="text-3xl font-black text-[#0c4a6e] font-fredoka leading-none">{me?.score || 0}</div>
          </div>
          
          {/* Timer / Energy Bar */}
          <div className="flex-1 max-w-md mx-8 relative pointer-events-auto">
            <div className="h-8 bg-[#075985] rounded-full border-2 border-[#38bdf8] overflow-hidden relative shadow-inner">
              <div 
                className="h-full bg-gradient-to-r from-yellow-300 to-yellow-500 transition-all duration-1000 ease-linear"
                style={{ width: `${((gameState?.timeLeft || 0) / 60) * 100}%` }}
              ></div>
            </div>
            <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-yellow-400 rounded-full border-4 border-white flex items-center justify-center shadow-lg z-10">
              <Zap className="w-6 h-6 text-yellow-900 fill-current" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center font-black text-white drop-shadow-md z-10 font-fredoka">
              {gameState?.timeLeft || 0}s
            </div>
          </div>

          {/* Pause Button */}
          <button className="w-12 h-12 bg-[#0284c7] rounded-xl flex items-center justify-center shadow-inner pointer-events-auto active:scale-95 transition-transform">
            <Pause className="w-6 h-6 text-[#0c4a6e] fill-current" />
          </button>
        </div>
      </div>

      {/* Leaderboard Toggle Button */}
      <button 
        onClick={() => setShowLeaderboard(!showLeaderboard)}
        className="absolute top-24 right-6 w-12 h-12 bg-[#0284c7] rounded-xl flex items-center justify-center shadow-lg pointer-events-auto border-2 border-[#38bdf8] z-20 active:scale-95 transition-transform"
      >
        <List className="w-6 h-6 text-white" />
      </button>

      {/* Leaderboard Panel */}
      {showLeaderboard && (
        <div className="absolute top-40 right-6 w-64 bg-[#082f49]/90 backdrop-blur-md border-2 border-[#0ea5e9] rounded-2xl p-4 shadow-2xl pointer-events-auto z-20 transition-all">
          <h3 className="text-white font-fredoka font-bold text-lg mb-3 border-b border-[#0ea5e9]/50 pb-2">Live Leaderboard</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
            {gameState && (Object.values(gameState.players) as Player[])
              .sort((a, b) => b.score - a.score)
              .map((p, i) => (
                <div key={p.id} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className={`font-black w-4 text-right ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-500' : 'text-sky-200'}`}>{i + 1}</span>
                    <span className={`font-bold truncate ${p.id === myId ? 'text-white' : 'text-sky-100'}`}>
                      {p.name}
                    </span>
                  </div>
                  <span className="font-black text-yellow-300 ml-2">{p.score}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Bottom Bar */}
      <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end z-10 pointer-events-none">
        {/* Controls Hint / Joystick */}
        {isTouchDevice ? (
          <div 
            className="w-32 h-32 bg-white/20 border-2 border-white/40 rounded-full backdrop-blur-sm touch-none pointer-events-auto relative shadow-lg"
            onTouchStart={handleTouch}
            onTouchMove={handleTouch}
            onTouchEnd={handleTouchEnd}
          >
            <div 
              className="absolute w-12 h-12 bg-white/80 rounded-full shadow-lg pointer-events-none transition-transform"
              style={{
                left: '50%', top: '50%',
                transform: `translate(calc(-50% + ${joystick.x}px), calc(-50% + ${joystick.y}px))`
              }}
            />
          </div>
        ) : (
          <div className="bg-black/20 backdrop-blur-sm px-4 py-2 rounded-xl text-white font-bold pointer-events-auto">
            Use WASD/Arrows
          </div>
        )}

        {/* Powerups */}
        {me && (
          <div className="flex gap-3 pointer-events-auto">
            <PowerupIcon active={me.activePowerups.magnet > now} icon={<Magnet className="w-5 h-5" />} color="bg-purple-500" />
            <PowerupIcon active={me.activePowerups.speed > now} icon={<Zap className="w-5 h-5" />} color="bg-yellow-500" />
            <PowerupIcon active={me.activePowerups.shield > now} icon={<Shield className="w-5 h-5" />} color="bg-cyan-500" />
            <PowerupIcon active={me.activePowerups.multiplier > now} icon={<Star className="w-5 h-5" />} color="bg-orange-500" />
          </div>
        )}
      </div>
    </div>
  );
}

function PowerupIcon({ active, icon, color }: { active: boolean, icon: React.ReactNode, color: string }) {
  return (
    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white transition-all duration-300 border-2 ${active ? `${color} border-white shadow-[0_0_15px_rgba(255,255,255,0.5)] scale-110` : 'bg-black/30 border-white/20 text-white/50 scale-100'}`}>
      {icon}
    </div>
  );
}
