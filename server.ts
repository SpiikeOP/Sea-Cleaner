import express from "express";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import * as http from "http";

const PORT = 3000;
const MAP_SIZE = 2000;
const TICK_RATE = 20; // 20 updates per second
const ROUND_DURATION = 60 * 1000; // 60 seconds

// Game State
type Player = {
  id: string;
  name: string;
  boatType: "speedster" | "collector" | "guardian";
  x: number;
  y: number;
  rotation: number;
  score: number;
  speed: number;
  turnRate: number;
  collectionRadius: number;
  boost: number;
  combo: number;
  lastCollectTime: number;
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
  type: "plastic" | "bag" | "can" | "oil" | "toxic" | "net" | "tire" | "rings" | "magnet" | "speed" | "shield" | "multiplier";
  x: number;
  y: number;
  category: "garbage" | "hazard" | "powerup";
  value: number;
};

let players: Record<string, Player> = {};
let items: Record<string, Item> = {};
let gameState: "waiting" | "playing" | "leaderboard" = "waiting";
let roundEndTime = 0;
let lastItemId = 0;

const BOAT_STATS = {
  speedster: { speed: 14, turnRate: 5, collectionRadius: 25 },
  collector: { speed: 9, turnRate: 8, collectionRadius: 45 },
  guardian: { speed: 11, turnRate: 6, collectionRadius: 35 }
};

const GARBAGE_TYPES = [
  { type: "plastic", value: 10 },
  { type: "bag", value: 5 },
  { type: "can", value: 15 },
  { type: "oil", value: 25 },
] as const;

const HAZARD_TYPES = [
  { type: "toxic", value: -20 },
  { type: "net", value: -30 },
  { type: "rings", value: -15 },
  { type: "tire", value: -10 },
] as const;

const POWERUP_TYPES = ["magnet", "speed", "shield", "multiplier"] as const;

function spawnItem(category: "garbage" | "hazard" | "powerup") {
  const id = `item_${lastItemId++}`;
  let typeInfo: any;
  
  if (category === "garbage") {
    typeInfo = GARBAGE_TYPES[Math.floor(Math.random() * GARBAGE_TYPES.length)];
  } else if (category === "hazard") {
    typeInfo = HAZARD_TYPES[Math.floor(Math.random() * HAZARD_TYPES.length)];
  } else {
    typeInfo = { type: POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)], value: 0 };
  }

  items[id] = {
    id,
    type: typeInfo.type,
    x: Math.random() * MAP_SIZE,
    y: Math.random() * MAP_SIZE,
    category,
    value: typeInfo.value,
  };
}

function initMap() {
  items = {};
  for (let i = 0; i < 200; i++) spawnItem("garbage");
  for (let i = 0; i < 80; i++) spawnItem("hazard");
  for (let i = 0; i < 15; i++) spawnItem("powerup");
}

function startGame() {
  gameState = "playing";
  roundEndTime = Date.now() + ROUND_DURATION;
  initMap();
  
  // Reset player scores and positions
  Object.values(players).forEach(p => {
    p.score = 0;
    p.combo = 0;
    p.x = Math.random() * MAP_SIZE;
    p.y = Math.random() * MAP_SIZE;
    p.invincibleUntil = 0;
    p.activePowerups = { magnet: 0, speed: 0, shield: 0, multiplier: 0 };
  });
}

function stopGame() {
  gameState = "leaderboard";
  setTimeout(() => {
    if (Object.keys(players).length > 0) {
      startGame();
    } else {
      gameState = "waiting";
    }
  }, 10000); // Show leaderboard for 10 seconds
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: "*" }
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Socket.io logic
  io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    socket.on("join", (data: { name: string, boatType: "speedster" | "collector" | "guardian" }) => {
      const stats = BOAT_STATS[data.boatType] || BOAT_STATS.guardian;
      players[socket.id] = {
        id: socket.id,
        name: (data.name || "Player").substring(0, 15),
        boatType: data.boatType || "guardian",
        x: Math.random() * MAP_SIZE,
        y: Math.random() * MAP_SIZE,
        rotation: 0,
        score: 0,
        speed: stats.speed,
        turnRate: stats.turnRate,
        collectionRadius: stats.collectionRadius,
        boost: 0,
        combo: 0,
        lastCollectTime: 0,
        invincibleUntil: 0,
        activePowerups: { magnet: 0, speed: 0, shield: 0, multiplier: 0 },
      };
      
      socket.emit("init", { mapSize: MAP_SIZE, id: socket.id });
      
      if (gameState === "waiting" && Object.keys(players).length >= 1) {
        startGame();
      }
    });

    socket.on("input", (input: { up: boolean, left: boolean, right: boolean, angle?: number, active?: boolean }) => {
      const p = players[socket.id];
      if (!p || gameState !== "playing") return;

      if (input.active && input.angle !== undefined) {
        let diff = input.angle - p.rotation;
        diff = ((diff + 180) % 360 + 360) % 360 - 180;
        
        if (Math.abs(diff) > p.turnRate) {
          p.rotation += Math.sign(diff) * p.turnRate;
        } else {
          p.rotation = input.angle;
        }
        p.rotation = (p.rotation + 360) % 360;
        
        const speedMult = p.activePowerups.speed > Date.now() ? 2 : 1;
        const rad = (p.rotation - 90) * Math.PI / 180;
        p.x += Math.cos(rad) * p.speed * speedMult;
        p.y += Math.sin(rad) * p.speed * speedMult;
      } else {
        if (input.left) p.rotation -= p.turnRate;
        if (input.right) p.rotation += p.turnRate;
        
        if (input.up) {
          const speedMult = p.activePowerups.speed > Date.now() ? 2 : 1;
          const rad = (p.rotation - 90) * Math.PI / 180;
          p.x += Math.cos(rad) * p.speed * speedMult;
          p.y += Math.sin(rad) * p.speed * speedMult;
        }
      }
      
      // Clamp to map
      p.x = Math.max(0, Math.min(MAP_SIZE, p.x));
      p.y = Math.max(0, Math.min(MAP_SIZE, p.y));
    });

    socket.on("disconnect", () => {
      console.log("Player disconnected:", socket.id);
      delete players[socket.id];
      if (Object.keys(players).length === 0) {
        gameState = "waiting";
      }
    });
  });

  // Game Loop
  setInterval(() => {
    const now = Date.now();
    
    if (gameState === "playing") {
      if (now >= roundEndTime) {
        stopGame();
      } else {
        // Collision detection
        Object.values(players).forEach(p => {
          const radius = p.activePowerups.magnet > now ? p.collectionRadius * 3 : p.collectionRadius;
          
          // Reset combo if too much time passed (3 seconds)
          if (now - p.lastCollectTime > 3000) {
            p.combo = 0;
          }

          Object.values(items).forEach(item => {
            const dx = p.x - item.x;
            const dy = p.y - item.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < radius + 15) { // 15 is approx item radius
              if (item.category === "garbage") {
                p.combo++;
                p.lastCollectTime = now;
                const comboMult = Math.min(3, 1 + Math.floor(p.combo / 5) * 0.5); // Max 3x from combo
                const powerupMult = p.activePowerups.multiplier > now ? 2 : 1;
                
                p.score += Math.floor(item.value * comboMult * powerupMult);
                delete items[item.id];
                spawnItem("garbage");
              } else if (item.category === "hazard") {
                if (p.invincibleUntil > now) {
                  // Ignore hazard
                } else if (p.activePowerups.shield > now) {
                  // Shield absorbs it, remove shield
                  p.activePowerups.shield = 0;
                  p.invincibleUntil = now + 2000; // 2 sec invincibility
                  delete items[item.id];
                  spawnItem("hazard");
                } else {
                  p.score += item.value; // Negative value
                  p.combo = 0;
                  p.invincibleUntil = now + 2000; // 2 sec invincibility
                  
                  if (item.type === "tire") {
                    // Bounce back
                    const rad = (p.rotation - 90) * Math.PI / 180;
                    p.x -= Math.cos(rad) * p.speed * 5;
                    p.y -= Math.sin(rad) * p.speed * 5;
                  } else {
                    delete items[item.id];
                    spawnItem("hazard");
                  }
                }
              } else if (item.category === "powerup") {
                if (item.type === "magnet") p.activePowerups.magnet = now + 10000;
                if (item.type === "speed") p.activePowerups.speed = now + 10000;
                if (item.type === "shield") p.activePowerups.shield = now + 10000;
                if (item.type === "multiplier") p.activePowerups.multiplier = now + 10000;
                delete items[item.id];
                spawnItem("powerup");
              }
            }
          });
        });

        // Spawn new powerups occasionally
        if (Math.random() < 0.01) { // roughly every 5 seconds
          spawnItem("powerup");
        }
      }
    }

    // Broadcast state
    io.emit("state", {
      players,
      items,
      gameState,
      timeLeft: Math.max(0, Math.floor((roundEndTime - now) / 1000)),
    });

  }, 1000 / TICK_RATE);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
