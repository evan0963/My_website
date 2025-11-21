/* Press the Button — sprite edition
   Sprites: embedded SVGs (can be replaced with PNG/SVG file paths)
   Controls: WASD / Arrow Keys
   Levels: 1) dodge stars  2) maze  3) runaway button
*/

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const levelEl = document.getElementById('level-label');
  const statusEl = document.getElementById('status-label');
  const resetBtn = document.getElementById('reset');
  const muteBtn  = document.getElementById('mute');

  // Palette (coffeehouse vibe)
  const COL = {
    ink: '#2b241f',
    muted: '#6e665f',
    bg: '#f5efe6',
    surf: '#fffaf3',
    acc1: '#8d5524',
    acc2: '#c7a349',
    sage: '#6b7d5c',
    terra: '#a06d5a'
  };

  // -------- Sprite loader (uses inline SVG data URIs) --------
  // You can replace these data URIs with "images/player.png", etc.
  const SPRITES = {
    player: svgURI(`
      <svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>
        <defs>
          <radialGradient id='g' cx='50%' cy='40%' r='60%'>
            <stop offset='0%' stop-color='#86a077'/>
            <stop offset='100%' stop-color='#6b7d5c'/>
          </radialGradient>
        </defs>
        <circle cx='16' cy='16' r='13' fill='url(#g)' stroke='#2b241f' stroke-width='2'/>
      </svg>`),

    star: svgURI(`
      <svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>
        <path d='M14 1 L17.6 9.2 26.6 10.2 19.8 15.9 21.8 24.7 14 20.1 6.2 24.7 8.2 15.9 1.4 10.2 10.4 9.2 Z'
              fill='#a06d5a' stroke='#2b241f' stroke-width='1.5' />
      </svg>`),

    buttonIdle: svgURI(`
      <svg xmlns='http://www.w3.org/2000/svg' width='120' height='44' viewBox='0 0 120 44'>
        <rect x='2' y='2' rx='10' ry='10' width='116' height='40' fill='#c7a349' />
        <rect x='2' y='2' rx='10' ry='10' width='116' height='40' fill='none' stroke='#2b241f' stroke-width='2' stroke-dasharray='6 6'/>
        <text x='60' y='27' font-family='system-ui, sans-serif' font-weight='700' font-size='16' text-anchor='middle' fill='#2b241f'>Press</text>
      </svg>`),

    buttonPressed: svgURI(`
      <svg xmlns='http://www.w3.org/2000/svg' width='120' height='44' viewBox='0 0 120 44'>
        <rect x='2' y='2' rx='10' ry='10' width='116' height='40' fill='#86a077' />
        <rect x='2' y='2' rx='10' ry='10' width='116' height='40' fill='none' stroke='#2b241f' stroke-width='2' stroke-dasharray='6 6'/>
        <text x='60' y='27' font-family='system-ui, sans-serif' font-weight='700' font-size='16' text-anchor='middle' fill='#2b241f'>Pressed!</text>
      </svg>`)
  };

  function svgURI(svg) {
    const min = svg.replace(/\s+/g, ' ').trim();
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(min);
  }

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = src;
    });
  }

  // Load all sprites, then init game
  Promise.all([
    loadImage(SPRITES.player),
    loadImage(SPRITES.star),
    loadImage(SPRITES.buttonIdle),
    loadImage(SPRITES.buttonPressed)
  ]).then(([IMG_PLAYER, IMG_STAR, IMG_BTN, IMG_BTN_P]) => {
    runGame(IMG_PLAYER, IMG_STAR, IMG_BTN, IMG_BTN_P);
  });

  // -------- Game logic --------
  function runGame(IMG_PLAYER, IMG_STAR, IMG_BTN, IMG_BTN_P){
    // Sound
    let soundOn = false;
    function beep(freq = 660, dur = 80, vol = 0.08) {
      if (!soundOn) return;
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'sine'; o.frequency.value = freq;
        o.connect(g); g.connect(ac.destination);
        g.gain.value = vol;
        o.start(); setTimeout(()=>{ o.stop(); ac.close(); }, dur);
      } catch {}
    }
    muteBtn.addEventListener('click', () => {
      soundOn = !soundOn;
      muteBtn.textContent = `Sound: ${soundOn ? 'On' : 'Off'}`;
      if (soundOn) beep(880, 60, 0.06);
    });

    // Fit canvas
    function fitCanvas() {
      const ratio = canvas.width / canvas.height; // 900/540
      const maxW = canvas.parentElement.clientWidth;
      const w = Math.min(maxW, 900);
      const h = w / ratio;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }
    window.addEventListener('resize', fitCanvas);
    fitCanvas();

    // Input
    const keys = new Set();
    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(k)) e.preventDefault();
      keys.add(k);
    });
    window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

    // Entities & state
    const player = { x: 60, y: 60, r: 12, speed: 3.0, w: 32, h: 32 };
    const button = { x: 820, y: 470, w: 120, h: 44, pressed: false };
    let level = 1;
    let hazards = []; // stars
    let maze = null;  // {grid, cols, rows}
    let t = 0;

    resetBtn.addEventListener('click', () => { startLevel(level); beep(440,80); });

    // Utils
    function setStatus(msg){ statusEl.textContent = msg; }
    function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
    function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh){
      return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }
    function circleRectOverlap(cx, cy, cr, rx, ry, rw, rh){
      const nx = clamp(cx, rx, rx + rw);
      const ny = clamp(cy, ry, ry + rh);
      const dx = cx - nx, dy = cy - ny;
      return (dx*dx + dy*dy) <= cr*cr;
    }
    function dist(ax, ay, bx, by){ return Math.hypot(ax-bx, ay-by); }

    // Level setup
    function startLevel(n){
      level = n;
      levelEl.textContent = String(level);
      button.pressed = false;
      t = 0;
      player.x = 60; player.y = 60;

      if (level === 1){
        setStatus('Dodge the stars and press the button.');
        button.x = canvas.width - 180; button.y = canvas.height - 90;
        hazards = [];
        for (let i=0;i<8;i++){
          hazards.push({
            x: 180 + Math.random()*(canvas.width-260),
            y: 120 + Math.random()*(canvas.height-180),
            vx: (Math.random()*1.5 + 0.6) * (Math.random()<0.5?-1:1),
            vy: (Math.random()*1.5 + 0.6) * (Math.random()<0.5?-1:1),
            size: 28
          });
        }
        maze = null;
      } else if (level === 2){
        setStatus('Find the path through the maze and press the button.');
        button.x = canvas.width - 180; button.y = canvas.height - 90;
        hazards = [];
        maze = buildMaze(30, 18);
        const s = cellSize();
        player.x = 1*s + s/2; player.y = 1*s + s/2;
      } else {
        setStatus('The button runs away. Corner it!');
        button.x = canvas.width - 220; button.y = canvas.height - 120;
        hazards = []; maze = null;
      }
    }

    function cellSize(){ return Math.floor(canvas.width / 30); }

    function buildMaze(cols, rows){
      const grid = Array.from({length: rows}, (_,y)=>Array.from({length: cols}, (_,x)=>{
        if (x===0||y===0||x===cols-1||y===rows-1) return 1;
        return 0;
      }));
      const wall = (x1,y1,x2,y2) => {
        for(let y=y1;y<=y2;y++){ for(let x=x1;x<=x2;x++){ grid[y][x]=1; } }
      };
      wall(3,2,26,2); wall(3,2,3,14);
      wall(6,5,26,5); wall(6,5,6,14);
      wall(9,8,26,8); wall(9,8,9,14);
      wall(12,11,26,11); wall(12,11,12,14);
      grid[3][3]=0; grid[6][6]=0; grid[9][9]=0; grid[12][12]=0;
      grid[rows-2][cols-2]=0;
      return { grid, cols, rows };
    }

    // Loop
    let last = performance.now();
    function loop(now){
      const dt = (now - last) / 16.6667;
      last = now; t += dt;
      update(dt);
      draw();
      requestAnimationFrame(loop);
    }

    function update(dt){
      // Movement
      const spd = player.speed * (maze ? 0.9 : 1);
      if (keys.has('arrowup') || keys.has('w')) player.y -= spd;
      if (keys.has('arrowdown') || keys.has('s')) player.y += spd;
      if (keys.has('arrowleft') || keys.has('a')) player.x -= spd;
      if (keys.has('arrowright') || keys.has('d')) player.x += spd;
      player.x = clamp(player.x, player.r, canvas.width - player.r);
      player.y = clamp(player.y, player.r, canvas.height - player.r);

      if (level === 1){
        // Move stars
        for (const h of hazards){
          h.x += h.vx * dt;
          h.y += h.vy * dt;
          if (h.x < h.size/2 || h.x > canvas.width - h.size/2) h.vx *= -1;
          if (h.y < h.size/2 || h.y > canvas.height - h.size/2) h.vy *= -1;

          // Collision with player?
          if (dist(player.x, player.y, h.x, h.y) < (player.r + h.size*0.35)){
            beep(220,120);
            startLevel(1);
            return;
          }
        }
        if (circleRectOverlap(player.x, player.y, player.r, button.x, button.y, button.w, button.h)){
          button.pressed = true; beep(880,120);
          setStatus('Level complete!');
          setTimeout(()=>startLevel(2), 600);
        }
      }
      else if (level === 2){
        if (maze){
          const s = cellSize();
          const minX = Math.max(0, Math.floor((player.x - player.r) / s) - 1);
          const maxX = Math.min(maze.cols-1, Math.floor((player.x + player.r) / s) + 1);
          const minY = Math.max(0, Math.floor((player.y - player.r) / s) - 1);
          const maxY = Math.min(maze.rows-1, Math.floor((player.y + player.r) / s) + 1);
          for (let y=minY;y<=maxY;y++){
            for (let x=minX;x<=maxX;x++){
              if (maze.grid[y][x] === 1){
                const rx = x*s, ry = y*s, rw = s, rh = s;
                if (circleRectOverlap(player.x, player.y, player.r, rx, ry, rw, rh)){
                  const cx = clamp(player.x, rx, rx+rw);
                  const cy = clamp(player.y, ry, ry+rh);
                  const dx = player.x - cx;
                  const dy = player.y - cy;
                  const len = Math.hypot(dx,dy) || 1;
                  const push = (player.r - Math.min(Math.abs(dx), Math.abs(dy))) || 1;
                  if (Math.abs(dx) > Math.abs(dy)) player.x += Math.sign(dx) * Math.max(1, push);
                  else player.y += Math.sign(dy) * Math.max(1, push);
                }
              }
            }
          }
        }
        if (circleRectOverlap(player.x, player.y, player.r, button.x, button.y, button.w, button.h)){
          button.pressed = true; beep(880,120);
          setStatus('Level complete!');
          setTimeout(()=>startLevel(3), 600);
        }
      }
      else if (level === 3){
        const fleeRadius = 120;
        const bx = button.x + button.w/2;
        const by = button.y + button.h/2;
        const d = dist(player.x, player.y, bx, by);
        if (d < fleeRadius){
          const k = (fleeRadius - d)/fleeRadius;
          const fx = (bx - player.x) / (d||1);
          const fy = (by - player.y) / (d||1);
          const speed = 3.2 * k;
          button.x += fx * speed * 3;
          button.y += fy * speed * 3;
          button.x = clamp(button.x, 10, canvas.width - button.w - 10);
          button.y = clamp(button.y, 10, canvas.height - button.h - 10);
        }
        if (circleRectOverlap(player.x, player.y, player.r, button.x, button.y, button.w, button.h)){
          button.pressed = true; beep(990,150);
          setStatus('You win! 🎉');
        }
      }
    }

    function draw() {
      clearBG();

      // faint squiggles/aroma lines
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = COL.muted;
      ctx.lineWidth = 2;
      for (let i=0;i<5;i++){
        ctx.beginPath();
        const y = 60 + i*80;
        ctx.moveTo(40, y);
        for (let x=40; x<canvas.width-40; x+=60){
          ctx.quadraticCurveTo(x+20, y + Math.sin((t*0.12 + x)*0.03)*16, x+60, y);
        }
        ctx.stroke();
      }
      ctx.restore();

      if (level === 1){
        for (const h of hazards){
          drawSprite(IMG_STAR, h.x - 14, h.y - 14, 28, 28);
        }
      }
      else if (level === 2 && maze){
        drawMaze(maze);
      }

      drawSprite(button.pressed ? IMG_BTN_P : IMG_BTN, button.x, button.y, button.w, button.h);
      drawSprite(IMG_PLAYER, player.x - player.w/2, player.y - player.h/2, player.w, player.h);
    }

    function clearBG(){
      ctx.fillStyle = COL.bg;
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.save();
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = COL.muted;
      for (let x=0;x<canvas.width;x+=16) ctx.fillRect(x,0,1,canvas.height);
      for (let y=0;y<canvas.height;y+=16) ctx.fillRect(0,y,canvas.width,1);
      ctx.restore();
    }

    function drawSprite(img, x, y, w, h){
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, x, y, w, h);
    }

    function drawMaze(maze){
      const s = cellSize();
      for (let y=0;y<maze.rows;y++){
        for (let x=0;x<maze.cols;x++){
          if (maze.grid[y][x] === 1){
            ctx.fillStyle = '#f1e7d7';
            ctx.fillRect(x*s, y*s, s, s);
            ctx.strokeStyle = 'rgba(43,36,31,.25)';
            ctx.setLineDash([5,6]); ctx.strokeRect(x*s+0.5, y*s+0.5, s-1, s-1); ctx.setLineDash([]);
          }
        }
      }
    }

    // Start
    startLevel(1);
    let lastFrame = performance.now();
    function frame(now){
      const dt = (now - lastFrame) / 16.6667;
      lastFrame = now; t += dt;
      update(dt); draw();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
})();
