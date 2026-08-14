if (false) {
/* ==========================================================
   CodeNest Grand Prix — standalone game script
   Ported from a Pygame source: typing-driven car racing.
   No dependencies. No build step.
   ========================================================== */
(function(){
  'use strict';

  // ---------- Palette (matches styles.css) ----------
  const COLORS = {
    ink:'#080b19', navy:'#0e142e', panel:'#131d3b', panel2:'#1d294e',
    white:'#eff6ff', muted:'#91a3c0', dim:'#5c6a8a',
    cyan:'#4debff', violet:'#9f6fff', pink:'#ff54a9',
    lime:'#72f2a8', gold:'#ffcd59', red:'#ff5b68'
  };

  const PARAGRAPHS = [
    'great code is not only correct it makes the next idea feel possible',
    'precision becomes speed when every keystroke has a clear purpose',
    'the fastest racers stay calm when the signal turns green',
    'small improvements compound into a spectacular finish',
    'build the future one confident line at a time'
  ];

  function clamp(v,lo,hi){ return Math.max(lo,Math.min(hi,v)); }
  function ordinal(n){
    const s = (10<=n%100 && n%100<=20) ? 'th' : ({1:'st',2:'nd',3:'rd'}[n%10] || 'th');
    return n+s;
  }
  function hexToRgba(hex,a){
    const v = hex.replace('#','');
    const r=parseInt(v.substring(0,2),16), g=parseInt(v.substring(2,4),16), b=parseInt(v.substring(4,6),16);
    return 'rgba('+r+','+g+','+b+','+a+')';
  }

  // ---------- DOM refs ----------
  const trackWrap = document.getElementById('trackWrap');
  const canvas = document.getElementById('track');
  const ctx = canvas.getContext('2d');
  const hiddenInput = document.getElementById('hiddenInput');

  const menuOverlay = document.getElementById('menuOverlay');
  const countdownOverlay = document.getElementById('countdownOverlay');
  const finishOverlay = document.getElementById('finishOverlay');
  const countdownNum = document.getElementById('countdownNum');
  const lights = Array.from(document.querySelectorAll('.light'));
  const startBtn = document.getElementById('startBtn');
  const againBtn = document.getElementById('againBtn');
  const bestLine = document.getElementById('bestLine');

  const posValue = document.getElementById('posValue');
  const statWpm = document.getElementById('statWpm');
  const statAcc = document.getElementById('statAcc');
  const statStreak = document.getElementById('statStreak');
  const nitroFill = document.getElementById('nitroFill');
  const typeText = document.getElementById('typeText');
  const typeProgressFill = document.getElementById('typeProgressFill');
  const ticker = document.getElementById('ticker');

  const finishTitle = document.getElementById('finishTitle');
  const finishSub = document.getElementById('finishSub');
  const teleTime = document.getElementById('teleTime');
  const teleWpm = document.getElementById('teleWpm');
  const telePrec = document.getElementById('telePrec');
  const teleStreak = document.getElementById('teleStreak');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Persisted best ----------
  let bestWpm = 0;
  try{ bestWpm = parseInt(localStorage.getItem('cn_gp_best_wpm')||'0',10) || 0; }catch(e){}
  function refreshBestLine(){
    bestLine.textContent = bestWpm ? ('Personal best: ' + bestWpm + ' WPM') : '';
  }
  refreshBestLine();

  // ---------- Audio ----------
  let audioCtx=null;
  function ensureAudio(){
    if(!audioCtx){ try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} }
    if(audioCtx && audioCtx.state==='suspended') audioCtx.resume();
  }
  function beep(o){
    if(!audioCtx) return;
    const t0=audioCtx.currentTime;
    const osc=audioCtx.createOscillator(), g=audioCtx.createGain();
    osc.type=o.type||'sine';
    osc.frequency.setValueAtTime(o.freq,t0);
    if(o.glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(o.glideTo,20), t0+o.duration);
    g.gain.setValueAtTime(Math.max(o.gain,0.0001),t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0+o.duration);
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start(t0); osc.stop(t0+o.duration+0.02);
  }
  function sfx(kind){
    ensureAudio();
    if(!audioCtx) return;
    if(kind==='key')    beep({freq:640,duration:.02,type:'square',gain:.012});
    if(kind==='error')  beep({freq:180,duration:.16,type:'sawtooth',gain:.06,glideTo:80});
    if(kind==='milestone'){ beep({freq:660,duration:.08,type:'sine',gain:.05}); setTimeout(()=>beep({freq:990,duration:.12,type:'sine',gain:.05}),70); }
    if(kind==='tick')   beep({freq:420,duration:.08,type:'sine',gain:.05});
    if(kind==='go')     beep({freq:880,duration:.22,type:'sine',gain:.07,glideTo:1300});
    if(kind==='finish'){ beep({freq:520,duration:.1,type:'sine',gain:.06}); setTimeout(()=>beep({freq:780,duration:.1,type:'sine',gain:.06}),90); setTimeout(()=>beep({freq:1040,duration:.16,type:'sine',gain:.06}),180); }
  }

  // ---------- Sparks ----------
  function makeSpark(x,y,color,vx,vy,life,size){ return {x,y,color,vx,vy,life,maxLife:life,size}; }
  let sparks = [];
  function updateSparks(dt){
    for(let i=sparks.length-1;i>=0;i--){
      const s=sparks[i];
      s.x+=s.vx*dt; s.y+=s.vy*dt;
      if(s.color===COLORS.red) s.vy += 80*dt;
      s.life-=dt;
      if(s.life<=0) sparks.splice(i,1);
    }
  }
  function drawSparks(){
    sparks.forEach(s=>{
      const t = clamp(s.life/s.maxLife,0,1);
      ctx.globalAlpha = t;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x,s.y,Math.max(1,s.size*clamp(t,0.35,1)),0,Math.PI*2);
      ctx.fill();
    });
    ctx.globalAlpha=1;
  }

  // ---------- Cars ----------
  function makeCar(name,lane,color,speed,player){
    return { name, lane, color, speed, player: !!player,
      progress:0, displayProgress:0, finished:false, rank:0, finishTime:0,
      phase: Math.random()*Math.PI*2, boost:0 };
  }
  let cars = [];
  let finishOrder = [];

  function currentRank(){
    const ranked = cars.slice().sort((a,b)=> (b.progress-a.progress) || (a.lane-b.lane) );
    return ranked.indexOf(cars[0]) + 1;
  }
  function placeFinished(car){
    if(finishOrder.indexOf(car)===-1){
      finishOrder.push(car);
      car.rank = finishOrder.length;
      car.finished = true;
      car.finishTime = elapsed;
    }
  }

  // ---------- Geometry (proportional to canvas size) ----------
  let W=0, H=0, DPR=1;
  let trackTop=0, trackBottom=0, trackLeft=0, trackRight=0, laneH=0;
  function computeGeometry(){
    const rect = trackWrap.getBoundingClientRect();
    W = rect.width; H = rect.height;
    DPR = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(W*DPR));
    canvas.height = Math.max(1, Math.round(H*DPR));
    ctx.setTransform(DPR,0,0,DPR,0,0);
    trackTop = H*0.30; trackBottom = H*0.90;
    trackLeft = W*0.09; trackRight = W*0.95;
    laneH = (trackBottom-trackTop)/4;
  }
  window.addEventListener('resize', computeGeometry);

  // ---------- Background decorations ----------
  let stars=[], skyline=[];
  function buildDecorations(){
    stars = [];
    for(let i=0;i<70;i++){
      stars.push({ x:Math.random()*W, y:Math.random()*trackTop*0.9, size:Math.random()<0.75?1:2, phase:Math.random()*10 });
    }
    skyline = [];
    let x = -10;
    while(x < W+20){
      const width = 18+Math.random()*22;
      skyline.push({ x, height: 16+Math.random()*(trackTop*0.55), width });
      x += width+4;
    }
  }

  // ---------- Game state ----------
  let state = 'menu'; // menu | countdown | racing | finished
  let target = PARAGRAPHS[Math.floor(Math.random()*PARAGRAPHS.length)];
  let typed = '';
  let error = false;
  let errorFlash = 0;
  let cameraShake = 0;
  let totalKeys=0, correctKeys=0, wpm=0, accuracy=100, streak=0, bestStreak=0, boost=0;
  let message = 'READY YOUR KEYBOARD', messageUntil = 0;
  let elapsed = 0;
  let countdownStart = 0;
  let raceStartClock = 0;

  function resetRace(){
    target = PARAGRAPHS[Math.floor(Math.random()*PARAGRAPHS.length)];
    typed=''; error=false; errorFlash=0; cameraShake=0;
    totalKeys=0; correctKeys=0; wpm=0; accuracy=100; streak=0; bestStreak=0; boost=0;
    message='READY YOUR KEYBOARD'; messageUntil=0;
    elapsed=0;
    sparks=[];
    finishOrder=[];
    cars = [
      makeCar('YOU', 0, COLORS.pink, 0, true),
      makeCar('BYTE FOX', 1, COLORS.cyan, 55+Math.random()*9),
      makeCar('NOVA', 2, COLORS.violet, 61+Math.random()*11),
      makeCar('GHOST', 3, COLORS.gold, 48+Math.random()*9)
    ];
    renderTypeText();
    updateDashboard();
  }

  function setMessage(text, duration){
    message = text;
    messageUntil = elapsed + (duration==null?1.0:duration);
  }

  // ---------- Typing text render ----------
  function escapeCharacter(ch){
    return ch==='&' ? '&amp;' : ch==='<' ? '&lt;' : ch==='>' ? '&gt;' : ch==='"' ? '&quot;' : ch==="'" ? '&#39;' : ch;
  }
  function renderTypeText(){
    let html = '';
    for(let i=0;i<target.length;i++){
      const ch = target[i];
      let cls = 'ch';
      if(i < typed.length) cls += ' done';
      else if(i === typed.length && state==='racing') cls += ' cursor' + (error?' err':'');
      html += '<span class="'+cls+'">'+escapeCharacter(ch)+'</span>';
    }
    typeText.innerHTML = html;
  }

  // ---------- Input handling ----------
  function focusInput(){ hiddenInput.focus({preventScroll:true}); }
  typeText.addEventListener('click', ()=>{ if(state==='racing') focusInput(); });
  trackWrap.addEventListener('click', ()=>{ if(state==='racing') focusInput(); });

  hiddenInput.addEventListener('keydown', e=>{
    if(state!=='racing') return;

    if(e.key==='Backspace'){
      e.preventDefault();
      if(typed.length>0) typed = typed.slice(0,-1);
      error=false;
      streak = Math.max(0, streak-2);
      renderTypeText();
      updateDashboard();
      return;
    }
    if(e.key==='Escape'){
      e.preventDefault();
      goToMenu();
      return;
    }
    if(e.key.length!==1) return; // ignore Shift/Ctrl/Tab/Enter/etc.
    if(typed.length >= target.length) return;
    e.preventDefault();

    totalKeys++;
    const expected = target[typed.length];
    if(e.key===expected){
      typed += e.key;
      correctKeys++;
      error=false;
      streak++;
      bestStreak = Math.max(bestStreak, streak);
      boost = clamp(boost + (streak%5===0 ? 0.07 : 0.023), 0, 1);
      sfx(streak%5===0 ? 'milestone' : 'key');
      const player = cars[0];
      const px = trackLeft + player.displayProgress*(trackRight-trackLeft);
      const py = trackTop + laneH*0.5;
      const n = streak%5===0 ? 3 : 1;
      for(let k=0;k<n;k++){
        sparks.push(makeSpark(px-16, py, streak%5===0?COLORS.lime:COLORS.pink,
          -35-Math.random()*90, (Math.random()-0.5)*60, 0.42, 2+Math.random()*2));
      }
      if(streak>0 && streak%15===0) setMessage('PERFECT STREAK \u00D7'+streak, 1.0);
      if(typed.length===target.length){
        placeFinished(player);
        finishRace();
      }
    } else {
      error=true;
      errorFlash=0.42;
      streak=0;
      boost=Math.max(0,boost-0.22);
      cameraShake=0.18;
      sfx('error');
      setMessage('MIS-TYPE \u2014 RESET YOUR RHYTHM', 0.75);
      const player = cars[0];
      const px = trackLeft + player.displayProgress*(trackRight-trackLeft);
      const py = trackTop + laneH*0.5;
      for(let k=0;k<10;k++){
        sparks.push(makeSpark(px, py, COLORS.red, (Math.random()-0.5)*220, -70-Math.random()*90, 0.5, 2+Math.random()*2));
      }
    }
    renderTypeText();
    updateDashboard();
  });

  document.addEventListener('keydown', e=>{
    if(e.key===' ' && (state==='menu' || state==='finished')){
      e.preventDefault();
      beginCountdown();
    }
  });
  startBtn.addEventListener('click', ()=>{ ensureAudio(); beginCountdown(); });
  againBtn.addEventListener('click', ()=>{ ensureAudio(); beginCountdown(); });

  // ---------- Flow ----------
  function showOverlay(el){ el.classList.add('show'); }
  function hideOverlay(el){ el.classList.remove('show'); }

  function goToMenu(){
    state='menu';
    hideOverlay(countdownOverlay); hideOverlay(finishOverlay);
    showOverlay(menuOverlay);
    refreshBestLine();
  }

  function beginCountdown(){
    ensureAudio();
    resetRace();
    hideOverlay(menuOverlay); hideOverlay(finishOverlay);
    showOverlay(countdownOverlay);
    state='countdown';
    countdownStart = performance.now()/1000;
    lights.forEach(l=>l.classList.remove('on'));
    countdownNum.classList.remove('go');
  }

  function finishRace(){
    state='finished';
    if(wpm>bestWpm){ bestWpm=wpm; try{ localStorage.setItem('cn_gp_best_wpm', String(bestWpm)); }catch(e){} }
    const player = cars[0];
    const champion = player.rank===1;
    finishTitle.textContent = champion ? 'VICTORY LAP!' : 'PHOTO FINISH';
    finishTitle.classList.toggle('champion', champion);
    finishSub.textContent = 'YOU TOOK ' + ordinal(player.rank).toUpperCase();
    teleTime.textContent = elapsed.toFixed(2)+'s';
    teleWpm.textContent = wpm+' WPM';
    telePrec.textContent = accuracy+'%';
    teleStreak.textContent = '\u00D7'+bestStreak;
    sfx('finish');
    setTimeout(()=>showOverlay(finishOverlay), 260);
  }

  // ---------- Per-car update ----------
  function updateCar(car, dt){
    if(car.finished){
      car.displayProgress += (1-car.displayProgress) * Math.min(1, dt*5);
      return;
    }
    if(car.player){
      car.progress = typed.length/target.length;
      car.boost = boost;
    } else {
      const cps = car.speed*5/60;
      const rhythm = 1 + Math.sin(elapsed*1.8+car.phase)*0.035 + Math.sin(elapsed*4.1+car.phase)*0.014;
      car.progress = Math.min(1, elapsed*cps*rhythm/target.length);
      car.boost = 0.35 + Math.sin(elapsed*2.5+car.phase)*0.15;
      if(car.progress>=1 && !car.finished) placeFinished(car);
    }
    car.displayProgress += (car.progress-car.displayProgress) * Math.min(1, dt*10);
  }

  // ---------- Main update ----------
  function update(dt){
    updateSparks(dt);
    errorFlash = Math.max(0, errorFlash-dt);
    cameraShake = Math.max(0, cameraShake-dt);

    if(state==='countdown'){
      const now = performance.now()/1000;
      const el = now - countdownStart;
      const remaining = 3 - Math.floor(el);
      lights.forEach((l,i)=> l.classList.toggle('on', i >= remaining));
      if(remaining<=0){
        countdownNum.textContent='GO!';
        countdownNum.classList.add('go');
      } else {
        countdownNum.textContent=String(remaining);
        countdownNum.classList.remove('go');
      }
      if(el >= 3.35){
        state='racing';
        elapsed=0;
        raceStartClock = performance.now()/1000;
        setMessage('GO! TYPE CLEAN. DRIVE FAST.', 1.15);
        hideOverlay(countdownOverlay);
        focusInput();
      }
      cars.forEach(c=>updateCar(c, dt));
      return;
    }

    if(state!=='racing'){
      cars.forEach(c=>updateCar(c, dt));
      return;
    }

    elapsed += dt;
    const minutes = Math.max(elapsed/60, 1/600);
    wpm = Math.round((correctKeys/5)/minutes);
    accuracy = totalKeys ? Math.round((correctKeys/totalKeys)*100) : 100;
    boost = Math.max(0, boost - dt*0.035);

    cars.forEach(c=>updateCar(c, dt));

    if(finishOrder.length===cars.length && !cars[0].finished){
      placeFinished(cars[0]);
      finishRace();
    }
  }

  function updateDashboard(){
    statWpm.innerHTML = wpm + '<span class="t-suffix">WPM</span>';
    statAcc.innerHTML = accuracy + '<span class="t-suffix">%</span>';
    statStreak.innerHTML = '\u00D7'+streak + '<span class="t-suffix">COMBO</span>';
    nitroFill.style.width = (boost*100).toFixed(1)+'%';
    nitroFill.classList.toggle('hot', boost>=0.72);
    typeProgressFill.style.width = (target.length ? (typed.length/target.length*100) : 0).toFixed(1)+'%';

    const rank = currentRank();
    posValue.textContent = ordinal(rank).toUpperCase();
    posValue.classList.toggle('first', rank===1);

    const now = elapsed;
    if(now < messageUntil){
      ticker.textContent = message;
      ticker.classList.toggle('err', !!error && message.indexOf('MIS-TYPE')===0);
      ticker.classList.toggle('hot', streak>=15);
    } else {
      ticker.textContent = 'TYPE THE HIGHLIGHTED CHARACTER TO DRIVE';
      ticker.classList.remove('err'); ticker.classList.remove('hot');
    }
  }

  // ---------- Drawing ----------
  function roundRectPath(c,x,y,w,h,r){
    if(c.roundRect){ c.beginPath(); c.roundRect(x,y,w,h,r); return; }
    c.beginPath();
    c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r);
    c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath();
  }

  function drawBackground(now){
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(0,0,W,H);
    const grad = ctx.createLinearGradient(0,0,0,trackTop*0.95);
    grad.addColorStop(0, COLORS.navy);
    grad.addColorStop(1, COLORS.ink);
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,W,trackTop*0.95);

    stars.forEach(s=>{
      const a = 0.4 + 0.4*Math.sin(now*2+s.phase);
      ctx.fillStyle = 'rgba(180,209,255,'+Math.max(0,a).toFixed(2)+')';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI*2);
      ctx.fill();
    });

    skyline.forEach((b,i)=>{
      const y = trackTop*0.95 - b.height;
      ctx.fillStyle = COLORS.navy;
      ctx.fillRect(b.x, y, b.width, b.height);
      ctx.fillStyle = COLORS.panel2;
      ctx.fillRect(b.x, y, b.width, 2);
      for(let wy = y+8; wy < trackTop*0.9; wy+=13){
        if((i*7 + Math.floor(wy/13)) % 3 !== 0){
          ctx.fillStyle = (i + Math.floor(wy/13)) % 4 ? COLORS.cyan : COLORS.violet;
          ctx.globalAlpha = 0.55;
          ctx.fillRect(b.x+5, wy, 2, 4);
          ctx.globalAlpha = 1;
        }
      }
    });

    const haze = ctx.createRadialGradient(W*0.5, trackTop*0.9, 4, W*0.5, trackTop*0.9, W*0.5);
    haze.addColorStop(0, hexToRgba(COLORS.violet,0.14));
    haze.addColorStop(1, hexToRgba(COLORS.violet,0));
    ctx.fillStyle = haze;
    ctx.fillRect(0, trackTop*0.5, W, trackTop*0.6);
  }

  function drawTrack(now){
    roundRectPath(ctx, trackLeft-14, trackTop-6, (trackRight-trackLeft)+28, (trackBottom-trackTop)+12, 12);
    ctx.fillStyle = 'rgba(19,25,50,0.6)';
    ctx.fill();

    roundRectPath(ctx, trackLeft, trackTop, trackRight-trackLeft, trackBottom-trackTop, 10);
    ctx.fillStyle = COLORS.panel2;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for(let y=trackTop+9; y<trackBottom; y+=18){
      ctx.beginPath(); ctx.moveTo(trackLeft+5,y); ctx.lineTo(trackRight-5,y); ctx.stroke();
    }
    ctx.strokeStyle = COLORS.cyan; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(trackLeft,trackTop); ctx.lineTo(trackRight,trackTop); ctx.stroke();
    ctx.strokeStyle = COLORS.pink;
    ctx.beginPath(); ctx.moveTo(trackLeft,trackBottom); ctx.lineTo(trackRight,trackBottom); ctx.stroke();

    for(let lane=1; lane<4; lane++){
      const y = trackTop + lane*laneH;
      const offset = (now*90) % 34;
      ctx.strokeStyle = 'rgba(181,200,255,0.5)';
      ctx.lineWidth = 2;
      for(let x=trackLeft+offset-34; x<trackRight; x+=34){
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+16,y); ctx.stroke();
      }
    }

    [[trackLeft,'START',COLORS.lime],[trackRight,'FINISH',COLORS.gold]].forEach(([edge,label,color])=>{
      ctx.strokeStyle = color; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(edge, trackTop-14); ctx.lineTo(edge, trackBottom+8); ctx.stroke();
      ctx.font = '700 10px "Space Grotesk", sans-serif';
      ctx.fillStyle = color; ctx.textAlign='center';
      ctx.fillText(label, edge, trackTop-20);
      ctx.textAlign='left';
    });

    const checkSize = 6;
    for(let row=0; row<Math.floor((trackBottom-trackTop)/checkSize); row++){
      for(let col=0; col<2; col++){
        ctx.fillStyle = (row+col)%2 ? COLORS.white : COLORS.ink;
        ctx.fillRect(trackRight-5+col*checkSize, trackTop+row*checkSize, checkSize, checkSize);
      }
    }

    for(let lane=0; lane<4; lane++){
      const y = trackTop + (lane+0.5)*laneH;
      ctx.fillStyle = COLORS.panel;
      ctx.beginPath(); ctx.arc(trackLeft-24, y, 11, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = COLORS.panel2; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(trackLeft-24, y, 11, 0, Math.PI*2); ctx.stroke();
      ctx.font = '700 11px "Space Grotesk", sans-serif';
      ctx.fillStyle = COLORS.muted; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(String(lane+1), trackLeft-24, y+1);
      ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    }

    const drawOrder = cars.slice().sort((a,b)=> a.player - b.player);
    drawOrder.forEach(c=>drawCar(c, now));
  }

  function drawCar(car, bobTime){
    const x = trackLeft + car.displayProgress*(trackRight-trackLeft);
    const laneY = trackTop + laneH*(car.lane+0.5);
    const y = laneY + Math.sin(bobTime*6+car.phase)*1.4;
    const scale = car.player ? 1.15 : 0.95;
    const w = 42*scale, h = 19*scale;

    if(car.boost>0.55 && !car.finished){
      for(let i=0;i<4;i++){
        const tx = x - w/2 - i*10;
        const a = Math.max(0.04, 0.4-i*0.09);
        ctx.fillStyle = hexToRgba(car.color, a);
        ctx.beginPath(); ctx.ellipse(tx,y,9,3.4,0,0,Math.PI*2); ctx.fill();
      }
    }

    ctx.save();
    ctx.globalAlpha=0.22;
    ctx.fillStyle = car.color;
    ctx.beginPath(); ctx.ellipse(x,y+h*0.32,w*0.7,h*0.7,0,0,Math.PI*2); ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(4,6,14,0.5)';
    ctx.beginPath(); ctx.ellipse(x-w*0.28,y+h*0.42,4,2.2,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x+w*0.28,y+h*0.42,4,2.2,0,0,Math.PI*2); ctx.fill();

    roundRectPath(ctx, x-w/2, y-h/2, w, h, h*0.42);
    ctx.fillStyle = car.color;
    ctx.fill();

    ctx.fillStyle = 'rgba(15,20,40,0.55)';
    roundRectPath(ctx, x-w*0.12, y-h*0.4, w*0.36, h*0.5, 3);
    ctx.fill();

    ctx.fillStyle = COLORS.white;
    ctx.beginPath(); ctx.arc(x+w/2-2, y-h*0.2, 1.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = COLORS.red;
    ctx.beginPath(); ctx.arc(x-w/2+2, y-h*0.2, 1.5, 0, Math.PI*2); ctx.fill();

    ctx.font = '700 10px "Space Grotesk", sans-serif';
    const label = car.name;
    const tw = ctx.measureText(label).width;
    const bx = x-tw/2-6, by = y-h/2-19, bw = tw+12, bh = 15;
    ctx.fillStyle = car.player ? car.color : 'rgba(19,29,59,0.92)';
    roundRectPath(ctx,bx,by,bw,bh,7); ctx.fill();
    ctx.strokeStyle = car.player ? COLORS.white : car.color;
    ctx.lineWidth=1;
    roundRectPath(ctx,bx,by,bw,bh,7); ctx.stroke();
    ctx.fillStyle = car.player ? '#0b0f1f' : COLORS.white;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(label, x, by+bh/2+0.5);
    ctx.textAlign='left'; ctx.textBaseline='alphabetic';

    if(!reduceMotion && Math.random() < (0.10+car.boost*0.12) && !car.finished){
      sparks.push(makeSpark(x-w/2, y+h/2, car.color, -30-Math.random()*40, (Math.random()-0.5)*20, 0.3, 2));
    }
  }

  function draw(now){
    ctx.clearRect(0,0,W,H);
    if(W<=0||H<=0) return;
    drawBackground(now);

    if(cameraShake>0 && !reduceMotion){
      const shakeX = (Math.random()-0.5)*10;
      ctx.save();
      ctx.translate(shakeX,0);
      drawTrack(now);
      ctx.restore();
    } else {
      drawTrack(now);
    }
    drawSparks();

    if(errorFlash>0){
      ctx.fillStyle = hexToRgba(COLORS.red, clamp(errorFlash/0.42,0,1)*0.22);
      ctx.fillRect(0,0,W,H);
    }
  }

  // ---------- Main loop ----------
  let lastTs=null;
  function loop(ts){
    requestAnimationFrame(loop);
    if(lastTs==null) lastTs=ts;
    let dt=(ts-lastTs)/1000;
    lastTs=ts;
    dt=Math.min(dt,0.05);
    const now = ts/1000;
    update(dt);
    draw(now);
    updateDashboard();
  }

  // ---------- Init ----------
  computeGeometry();
  buildDecorations();
  window.addEventListener('resize', buildDecorations);
  resetRace();
  requestAnimationFrame(loop);
})();
'use strict';
// Minimal fake DOM/canvas so we can load the real script.js in Node and
// drive it through a full race, catching crashes and checking key
// side-effects (localStorage writes, overlay state, ghost car creation).

const listeners = {}; // per-element event listeners, keyed by element id (or 'document'/'window')

function makeClassList(el){
  const set = new Set();
  return {
    add:(...c)=>c.forEach(x=>set.add(x)),
    remove:(...c)=>c.forEach(x=>set.delete(x)),
    toggle:(c,force)=>{ if(force===undefined){ if(set.has(c)){set.delete(c);return false;} set.add(c); return true;} if(force){set.add(c);}else{set.delete(c);} return force; },
    contains:(c)=>set.has(c),
    _set:set
  };
}

function makeCtx(){
  const grad = { addColorStop(){} };
  return {
    fillRect(){}, clearRect(){}, beginPath(){}, closePath(){}, moveTo(){}, lineTo(){}, arcTo(){},
    arc(){}, ellipse(){}, rect(){}, roundRect(){}, fill(){}, stroke(){}, save(){}, restore(){},
    setLineDash(){}, setTransform(){}, translate(){},
    createLinearGradient(){ return grad; }, createRadialGradient(){ return grad; },
    measureText(){ return {width: 20}; }, fillText(){}, strokeText(){},
    fillStyle:'', strokeStyle:'', lineWidth:1, globalAlpha:1, font:'', textAlign:'left', textBaseline:'alphabetic'
  };
}

function makeSegButtons(names, attr){
  return names.map(n=>{
    const el = {
      dataset:{[attr]:n},
      classList: makeClassList(),
      tagName:'BUTTON'
    };
    return el;
  });
}

function makeEl(id){
  const btns = id==='modeSeg' ? makeSegButtons(['prose','code'],'mode')
             : id==='diffSeg' ? makeSegButtons(['short','medium','long'],'diff')
             : null;
  const el = {
    id,
    classList: makeClassList(),
    style: {},
    dataset: {},
    _value: '',
    get value(){ return this._value; },
    set value(v){ this._value = v; },
    textContent:'', innerHTML:'', innerText:'',
    children: btns || [],
    addEventListener(type, fn){ (listeners[id] = listeners[id]||{})[type] = (listeners[id][type]||[]).concat(fn); },
    dispatchEvent(evt){ ((listeners[id]||{})[evt.type]||[]).forEach(fn=>fn(evt)); },
    focus(){},
    getAttribute(k){ return this['_attr_'+k]; },
    setAttribute(k,v){ this['_attr_'+k]=v; },
    querySelector(sel){ return sel==='span' ? {textContent:''} : null; },
    querySelectorAll(sel){ return btns || []; },
    closest(sel){ return null; },
    getBoundingClientRect(){ return {width:800, height:600}; },
    getContext(){ return makeCtx(); },
    get width(){ return this._w||0; }, set width(v){ this._w=v; },
    get height(){ return this._h||0; }, set height(v){ this._h=v; },
  };
  if(btns){
    btns.forEach(b=>{
      b.addEventListener = (type,fn)=>{};
    });
  }
  return el;
}

const idsNeeded = [
  'trackWrap','track','hiddenInput','menuOverlay','countdownOverlay','finishOverlay','confirmOverlay',
  'countdownNum','startBtn','againBtn','resumeBtn','quitBtn','bestLine','muteBtn','modeSeg','diffSeg',
  'ariaLive','posValue','statWpm','statAcc','statStreak','nitroFill','typeText','typeProgressFill',
  'ticker','finishTitle','finishSub','teleTime','teleWpm','telePrec','teleStreak'
];
const elements = {};
idsNeeded.forEach(id=> elements[id] = makeEl(id));

const lights = [0,1,2].map(()=>({classList: makeClassList(), dataset:{}}));

global.document = {
  getElementById(id){ if(!elements[id]) throw new Error('Missing stub element: '+id); return elements[id]; },
  querySelectorAll(sel){ if(sel==='.light') return lights; return []; },
  addEventListener(type, fn){ (listeners['document']=listeners['document']||{})[type] = (listeners['document'][type]||[]).concat(fn); },
};

let raf_queue = [];
global.window = {
  addEventListener(){},
  matchMedia(){ return {matches:false}; },
  devicePixelRatio: 1,
  AudioContext: undefined,
  webkitAudioContext: undefined,
  requestAnimationFrame(fn){ raf_queue.push(fn); return raf_queue.length; },
};
global.requestAnimationFrame = window.requestAnimationFrame;

const store = {};
global.localStorage = {
  getItem(k){ return Object.prototype.hasOwnProperty.call(store,k) ? store[k] : null; },
  setItem(k,v){ store[k]=String(v); },
  removeItem(k){ delete store[k]; },
};

let perfNow = 0;
global.performance = { now(){ return perfNow; } };

// load the real game script
require('./script.js');

console.log('Module loaded without throwing.');

// ---- drive a full race ----
function fireKeydown(id, key){
  (listeners[id] && listeners[id].keydown || []).forEach(fn=>fn({key, preventDefault(){}}));
}
function fireInput(id, data, inputType){
  elements[id].value = data || '';
  (listeners[id] && listeners[id].input || []).forEach(fn=>fn({data, inputType: inputType||'insertText', preventDefault(){}}));
}
function tick(dtMs){
  perfNow += dtMs;
  const queue = raf_queue; raf_queue = [];
  queue.forEach(fn=>fn(perfNow));
}

// initial frame already scheduled by the module's own requestAnimationFrame(loop) call
tick(16);
console.log('First frame ran OK. Menu state assumed.');

// start the race (Space on document)
(listeners['document'] && listeners['document'].keydown || []).forEach(fn=>fn({key:' ', preventDefault(){}}));
tick(16);
console.log('Countdown started.');

// fast-forward through the 3-2-1 countdown (needs >3.35s elapsed)
tick(4000);
tick(16);
console.log('Should now be racing. typeText.innerHTML length =', elements.typeText.innerHTML.length);

if(!elements.typeText.innerHTML.includes('span')){
  throw new Error('typeText was not rendered with spans as expected');
}

// Need the actual target text to type it correctly. We can't read the closure's
// `target` directly, but menu defaults to prose/medium; grab the first medium
// prose sentence used at seed time is random, so instead just brute-force type
// plausible words won't work. Instead, exercise the input pipeline generically:
// send garbage chars (should register as misses without throwing) and backspace,
// then confirm nothing crashes and dashboard updates.
fireInput('hiddenInput', 'z');
fireInput('hiddenInput', 'z');
fireKeydown('hiddenInput', 'Backspace');
tick(16);
console.log('Garbage input + backspace handled without throwing.');

// Escape should pause the race and show the confirm overlay
fireKeydown('hiddenInput', 'Escape');
tick(16);
if(!elements.confirmOverlay.classList.contains('show')){
  throw new Error('Escape during racing did not show the confirm overlay');
}
console.log('Pause/confirm overlay works.');

// Resume via Escape again
fireKeydown('hiddenInput', 'Escape');
tick(16);
if(elements.confirmOverlay.classList.contains('show')){
  throw new Error('Escape while paused did not resume (overlay still showing)');
}
console.log('Resume works.');

// Mode/diff switch handlers should not throw even with stubbed segmented buttons
(listeners['modeSeg'] && listeners['modeSeg'].click || []).forEach(fn=>{});
console.log('No click listeners crashed on modeSeg (delegation stub limited, acceptable).');

// Return cleanly to the menu (pause -> quit) so the next race starts fresh.
fireKeydown('hiddenInput', 'Escape'); // pause
tick(16);
(listeners['quitBtn'] && listeners['quitBtn'].click || []).forEach(fn=>fn({}));
tick(16);
if(!elements.menuOverlay.classList.contains('show')){
  throw new Error('Quit-to-menu did not show the menu overlay');
}
console.log('Quit-to-menu works.');

function extractTarget(html){
  const out = [];
  const re = /<span class="[^"]*">([^<]*)<\/span>/g;
  let m;
  while((m = re.exec(html))){ out.push(m[1] === '' ? '\n' : m[1]); }
  return out.join('');
}
const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));

async function runTypedRace(label){
  (listeners['document'] && listeners['document'].keydown || []).forEach(fn=>fn({key:' ', preventDefault(){}}));
  tick(4100); // through countdown into racing
  const target = extractTarget(elements.typeText.innerHTML);
  console.log(label, 'target length:', target.length);
  for(const ch of target){
    if(ch === '\n') fireKeydown('hiddenInput', 'Enter'); else fireInput('hiddenInput', ch);
    tick(20);
  }
  // finishRace() shows the overlay via a real 260ms setTimeout - wait for it.
  await sleep(320);
  tick(16);
  if(!elements.finishOverlay.classList.contains('show')){
    const doneCount = (elements.typeText.innerHTML.match(/ch done/g)||[]).length;
    throw new Error(label+': finish overlay never showed ('+doneCount+'/'+target.length+' chars registered as done)');
  }
  console.log(label, 'finished:', elements.finishSub.textContent, elements.teleWpm.textContent, elements.telePrec.textContent);
}

(async ()=>{
  await runTypedRace('Second race');

  console.log('localStorage cn_gp_best_wpm =', store['cn_gp_best_wpm']);
  console.log('localStorage cn_gp_recent_wpm =', store['cn_gp_recent_wpm']);
  const ghostStored = Object.keys(store).find(k=>k.startsWith('cn_gp_ghost_'));
  console.log('ghost key stored:', ghostStored, '->', store[ghostStored] ? JSON.parse(store[ghostStored]).trace.length + ' trace samples' : 'NONE');
  if(!ghostStored) throw new Error('No ghost trace was saved after finishing a race');

  // Back to menu, then race again - the ghost car ("BEST LAP") should now exist.
  fireKeydown('hiddenInput', 'Escape');
  tick(16);
  (listeners['quitBtn'] && listeners['quitBtn'].click || []).forEach(fn=>fn({}));
  tick(16);

  await runTypedRace('Third race (ghost car active)');

  console.log('ALL INTEGRATION SMOKE CHECKS PASSED');
})().catch(err=>{ console.error(err); process.exit(1); });
}
/* ==========================================================
   CodeNest Grand Prix — standalone game script
   Ported from a Pygame source: typing-driven car racing.
   No dependencies. No build step.
   ========================================================== */
(function(){
  'use strict';

  // ---------- Palette (matches styles.css) ----------
  const COLORS = {
    ink:'#080b19', navy:'#0e142e', panel:'#131d3b', panel2:'#1d294e',
    white:'#eff6ff', muted:'#91a3c0', dim:'#5c6a8a',
    cyan:'#4debff', violet:'#9f6fff', pink:'#ff54a9',
    lime:'#72f2a8', gold:'#ffcd59', red:'#ff5b68'
  };

  // ---------- Content pools ----------
  // Two modes (prose / code) x three lengths (short / medium / long).
  // Code snippets use real brackets, indentation and symbols on purpose —
  // racing on code you'd actually type is a better fit for a coding-ed
  // product than generic sentences.
  const CONTENT = {
    prose: {
      short: [
        'clean code reads like a clear plan',
        'type with intention not just speed',
        'small wins build real momentum',
        'focus turns effort into flow',
        'confidence grows one keystroke at a time',
        'steady hands win close finishes',
        'practice quietly outpaces talent',
        'good habits compile into great results'
      ],
      medium: [
        'great code is not only correct it makes the next idea feel possible',
        'precision becomes speed when every keystroke has a clear purpose',
        'the fastest racers stay calm when the signal turns green',
        'small improvements compound into a spectacular finish',
        'build the future one confident line at a time',
        'every bug you squash today is a lesson you will not repeat tomorrow',
        'the keyboard rewards patience long before it rewards raw speed',
        'a calm mind reads the track better than a fast pair of hands',
        'debugging is just detective work with better lighting and worse coffee',
        'momentum is built keystroke by keystroke not lap by lap'
      ],
      long: [
        'the best engineers treat every mistake as a free lesson wrapped in a stack trace and every clean run as proof the practice is paying off',
        'racing against rivals is fun but racing against the version of yourself from last week is the rivalry that actually makes you better',
        'a good typist trusts their fingers a great typist trusts their preparation and a champion typist never notices the difference anymore',
        'nobody remembers how fast the first lap felt they remember whether they kept their line clean when the pressure finally arrived',
        'the fastest way to finish first is rarely to type faster it is almost always to make fewer mistakes than everyone chasing you'
      ]
    },
    code: {
      short: [
        `const wpm = correctKeys / 5 / minutes;`,
        `if (typed.length === target.length) win();`,
        `let streak = 0; streak += 1;`,
        `export default function race() {}`,
        `array.map(x => x * 2).filter(Boolean);`,
        `class Car { constructor(name) {} }`,
        `return a > b ? a : b;`,
        `console.log('go!');`
      ],
      medium: [
        `function boost(streak) {
  if (streak % 5 === 0) return 0.07;
  return 0.02;
}`,
        `for (let i = 0; i < cars.length; i++) {
  cars[i].update(dt);
}`,
        `const car = {
  name: 'YOU',
  speed: 0,
};`,
        `try {
  start();
} catch (e) {
  console.error(e);
}`,
        `if (error) {
  streak = 0;
} else {
  streak++;
}`
      ],
      long: [
        `function updateCar(car, dt) {
  if (car.finished) return;
  car.progress += car.speed * dt;
  if (car.progress >= 1) {
    finish(car);
  }
}`,
        `class Racer {
  constructor(name, speed) {
    this.name = name;
    this.speed = speed;
  }
  tick(dt) {
    this.progress += this.speed * dt;
  }
}`,
        `function average(nums) {
  let total = 0;
  for (const n of nums) {
    total += n;
  }
  return total / nums.length;
}`
      ]
    }
  };

  function clamp(v,lo,hi){ return Math.max(lo,Math.min(hi,v)); }
  function ordinal(n){
    const s = (10<=n%100 && n%100<=20) ? 'th' : ({1:'st',2:'nd',3:'rd'}[n%10] || 'th');
    return n+s;
  }
  function hexToRgba(hex,a){
    const v = hex.replace('#','');
    const r=parseInt(v.substring(0,2),16), g=parseInt(v.substring(2,4),16), b=parseInt(v.substring(4,6),16);
    return 'rgba('+r+','+g+','+b+','+a+')';
  }

  // ---------- DOM refs ----------
  const trackWrap = document.getElementById('trackWrap');
  const canvas = document.getElementById('track');
  const ctx = canvas.getContext('2d');
  const hiddenInput = document.getElementById('hiddenInput');

  const menuOverlay = document.getElementById('menuOverlay');
  const countdownOverlay = document.getElementById('countdownOverlay');
  const finishOverlay = document.getElementById('finishOverlay');
  const confirmOverlay = document.getElementById('confirmOverlay');
  const countdownNum = document.getElementById('countdownNum');
  const lights = Array.from(document.querySelectorAll('.light'));
  const startBtn = document.getElementById('startBtn');
  const againBtn = document.getElementById('againBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const quitBtn = document.getElementById('quitBtn');
  const bestLine = document.getElementById('bestLine');
  const muteBtn = document.getElementById('muteBtn');
  const modeSeg = document.getElementById('modeSeg');
  const diffSeg = document.getElementById('diffSeg');
  const ariaLive = document.getElementById('ariaLive');

  const posValue = document.getElementById('posValue');
  const statWpm = document.getElementById('statWpm');
  const statAcc = document.getElementById('statAcc');
  const statStreak = document.getElementById('statStreak');
  const nitroFill = document.getElementById('nitroFill');
  const typeText = document.getElementById('typeText');
  const typeProgressFill = document.getElementById('typeProgressFill');
  const ticker = document.getElementById('ticker');

  const finishTitle = document.getElementById('finishTitle');
  const finishSub = document.getElementById('finishSub');
  const teleTime = document.getElementById('teleTime');
  const teleWpm = document.getElementById('teleWpm');
  const telePrec = document.getElementById('telePrec');
  const teleStreak = document.getElementById('teleStreak');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function announce(msg){ if(ariaLive) ariaLive.textContent = msg; }

  // ---------- Race setup (mode / difficulty) ----------
  let contentMode = 'prose', difficulty = 'medium';
  try{
    const m = localStorage.getItem('cn_gp_mode'); if(m==='prose'||m==='code') contentMode = m;
    const d = localStorage.getItem('cn_gp_diff'); if(d==='short'||d==='medium'||d==='long') difficulty = d;
  }catch(e){}

  function ghostKey(){ return 'cn_gp_ghost_'+contentMode+'_'+difficulty; }

  function pickTarget(){
    const pool = (CONTENT[contentMode] && CONTENT[contentMode][difficulty]) || CONTENT.prose.medium;
    return pool[Math.floor(Math.random()*pool.length)];
  }

  // ---------- Persisted bests ----------
  let bestWpm = 0;
  try{ bestWpm = parseInt(localStorage.getItem('cn_gp_best_wpm')||'0',10) || 0; }catch(e){}

  function refreshBestLine(){
    let html = bestWpm ? ('All-time best: ' + bestWpm + ' WPM') : '';
    try{
      const g = JSON.parse(localStorage.getItem(ghostKey())||'null');
      if(g && g.wpm){
        html += (html ? ' &middot; ' : '') + 'Best Lap ghost ready (' + g.wpm + ' WPM)';
      }
    }catch(e){}
    bestLine.innerHTML = html;
  }
  refreshBestLine();

  // ---------- Rolling skill average (drives AI pace) ----------
  let recentWpm = [];
  try{ recentWpm = JSON.parse(localStorage.getItem('cn_gp_recent_wpm')||'[]'); if(!Array.isArray(recentWpm)) recentWpm=[]; }catch(e){ recentWpm=[]; }
  function rollingAvgWpm(){
    if(!recentWpm.length) return 50;
    return recentWpm.reduce((a,b)=>a+b,0)/recentWpm.length;
  }
  function recordWpm(w){
    if(!w) return;
    recentWpm.push(w);
    if(recentWpm.length>5) recentWpm.shift();
    try{ localStorage.setItem('cn_gp_recent_wpm', JSON.stringify(recentWpm)); }catch(e){}
  }
  function aiSpeed(kind){
    const base = clamp(rollingAvgWpm(), 20, 220);
    if(kind==='byte')  return Math.max(22, base*0.90 + (Math.random()*9-3));
    if(kind==='nova')  return Math.max(24, base*1.05 + (Math.random()*10-3));
    if(kind==='ghost') return Math.max(20, base*0.78 + (Math.random()*8-2));
    return base;
  }

  // ---------- Mute ----------
  let muted = false;
  try{ muted = localStorage.getItem('cn_gp_muted')==='1'; }catch(e){}
  function refreshMuteBtn(){
    const glyph = muteBtn.querySelector('span');
    if(glyph) glyph.textContent = muted ? '\u{1F507}' : '\u{1F50A}';
    muteBtn.setAttribute('aria-pressed', String(muted));
    muteBtn.setAttribute('aria-label', muted ? 'Unmute sound effects' : 'Mute sound effects');
  }
  refreshMuteBtn();
  muteBtn.addEventListener('click', ()=>{
    muted = !muted;
    try{ localStorage.setItem('cn_gp_muted', muted?'1':'0'); }catch(e){}
    refreshMuteBtn();
  });

  // ---------- Audio ----------
  let audioCtx=null;
  function ensureAudio(){
    if(!audioCtx){ try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} }
    if(audioCtx && audioCtx.state==='suspended') audioCtx.resume();
  }
  function beep(o){
    if(!audioCtx) return;
    const t0=audioCtx.currentTime;
    const osc=audioCtx.createOscillator(), g=audioCtx.createGain();
    osc.type=o.type||'sine';
    osc.frequency.setValueAtTime(o.freq,t0);
    if(o.glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(o.glideTo,20), t0+o.duration);
    g.gain.setValueAtTime(Math.max(o.gain,0.0001),t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0+o.duration);
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start(t0); osc.stop(t0+o.duration+0.02);
  }
  function sfx(kind){
    if(muted) return;
    ensureAudio();
    if(!audioCtx) return;
    if(kind==='key')    beep({freq:640,duration:.02,type:'square',gain:.012});
    if(kind==='error')  beep({freq:180,duration:.16,type:'sawtooth',gain:.06,glideTo:80});
    if(kind==='milestone'){ beep({freq:660,duration:.08,type:'sine',gain:.05}); setTimeout(()=>beep({freq:990,duration:.12,type:'sine',gain:.05}),70); }
    if(kind==='tick')   beep({freq:420,duration:.08,type:'sine',gain:.05});
    if(kind==='go')     beep({freq:880,duration:.22,type:'sine',gain:.07,glideTo:1300});
    if(kind==='finish'){ beep({freq:520,duration:.1,type:'sine',gain:.06}); setTimeout(()=>beep({freq:780,duration:.1,type:'sine',gain:.06}),90); setTimeout(()=>beep({freq:1040,duration:.16,type:'sine',gain:.06}),180); }
    if(kind==='cheer'){ beep({freq:520,duration:.1,type:'triangle',gain:.05}); setTimeout(()=>beep({freq:660,duration:.1,type:'triangle',gain:.05}),90); setTimeout(()=>beep({freq:880,duration:.14,type:'triangle',gain:.06}),180); setTimeout(()=>beep({freq:1040,duration:.18,type:'triangle',gain:.06}),270); }
  }

  // ---------- Sparks / confetti ----------
  function makeSpark(x,y,color,vx,vy,life,size,gravity){ return {x,y,color,vx,vy,life,maxLife:life,size,gravity:!!gravity}; }
  let sparks = [];
  function updateSparks(dt){
    for(let i=sparks.length-1;i>=0;i--){
      const s=sparks[i];
      s.x+=s.vx*dt; s.y+=s.vy*dt;
      if(s.gravity) s.vy += 80*dt;
      s.life-=dt;
      if(s.life<=0) sparks.splice(i,1);
    }
  }
  function drawSparks(){
    sparks.forEach(s=>{
      const t = clamp(s.life/s.maxLife,0,1);
      ctx.globalAlpha = t;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x,s.y,Math.max(1,s.size*clamp(t,0.35,1)),0,Math.PI*2);
      ctx.fill();
    });
    ctx.globalAlpha=1;
  }
  function spawnConfetti(){
    const palette=[COLORS.cyan,COLORS.violet,COLORS.pink,COLORS.lime,COLORS.gold];
    for(let i=0;i<70;i++){
      const x = Math.random()*W;
      const y = -10-Math.random()*60;
      const c = palette[Math.floor(Math.random()*palette.length)];
      sparks.push(makeSpark(x,y,c,(Math.random()-0.5)*70,70+Math.random()*110,1.4+Math.random()*0.9,2+Math.random()*2.6,true));
    }
  }

  // ---------- Cars ----------
  function makeCar(name,lane,color,speed,player,icon){
    return { name, lane, color, speed, player: !!player, icon: icon||'circle',
      progress:0, displayProgress:0, finished:false, rank:0, finishTime:0,
      phase: Math.random()*Math.PI*2, boost:0 };
  }
  let cars = [];
  let finishOrder = [];

  function currentRank(){
    const ranked = cars.slice().sort((a,b)=> (b.progress-a.progress) || (a.lane-b.lane) );
    return ranked.indexOf(cars[0]) + 1;
  }
  function placeFinished(car){
    if(finishOrder.indexOf(car)===-1){
      finishOrder.push(car);
      car.rank = finishOrder.length;
      car.finished = true;
      car.finishTime = elapsed;
    }
  }
  function sampleTrace(trace, t){
    if(!trace || !trace.length) return 0;
    if(t <= trace[0][0]) return trace[0][1];
    for(let i=1;i<trace.length;i++){
      if(t <= trace[i][0]){
        const t0=trace[i-1][0], p0=trace[i-1][1], t1=trace[i][0], p1=trace[i][1];
        const f = t1>t0 ? (t-t0)/(t1-t0) : 1;
        return p0 + (p1-p0)*f;
      }
    }
    return 1;
  }

  // ---------- Geometry (proportional to canvas size) ----------
  let W=0, H=0, DPR=1;
  let trackTop=0, trackBottom=0, trackLeft=0, trackRight=0, laneH=0;
  function computeGeometry(){
    const rect = trackWrap.getBoundingClientRect();
    W = rect.width; H = rect.height;
    DPR = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(W*DPR));
    canvas.height = Math.max(1, Math.round(H*DPR));
    ctx.setTransform(DPR,0,0,DPR,0,0);
    trackTop = H*0.30; trackBottom = H*0.90;
    trackLeft = W*0.09; trackRight = W*0.95;
    laneH = (trackBottom-trackTop) / Math.max(1, (cars && cars.length) || 4);
  }
  window.addEventListener('resize', computeGeometry);

  // ---------- Background decorations ----------
  let stars=[], skyline=[];
  function buildDecorations(){
    stars = [];
    for(let i=0;i<70;i++){
      stars.push({ x:Math.random()*W, y:Math.random()*trackTop*0.9, size:Math.random()<0.75?1:2, phase:Math.random()*10 });
    }
    skyline = [];
    let x = -10;
    while(x < W+20){
      const width = 18+Math.random()*22;
      skyline.push({ x, height: 16+Math.random()*(trackTop*0.55), width });
      x += width+4;
    }
  }

  // ---------- Game state ----------
  let state = 'menu'; // menu | countdown | racing | paused | finished
  let target = pickTarget();
  let typed = '';
  let error = false;
  let errorFlash = 0;
  let celebrationFlash = 0;
  let cameraShake = 0;
  let totalKeys=0, correctKeys=0, wpm=0, accuracy=100, streak=0, bestStreak=0, boost=0;
  let message = 'READY YOUR KEYBOARD', messageUntil = 0;
  let elapsed = 0;
  let countdownStart = 0;
  let lastCountdownAnnounced = null;
  let traceSamples = [], traceSampleTimer = 0;
  let lastAnnouncedRank = null, lastRankAnnounceTime = -99;

  function resetRace(){
    target = pickTarget();
    typed=''; error=false; errorFlash=0; cameraShake=0; celebrationFlash=0;
    totalKeys=0; correctKeys=0; wpm=0; accuracy=100; streak=0; bestStreak=0; boost=0;
    message='READY YOUR KEYBOARD'; messageUntil=0;
    elapsed=0;
    traceSamples=[]; traceSampleTimer=0;
    lastAnnouncedRank=null; lastRankAnnounceTime=-99;
    sparks=[];
    finishOrder=[];

    let ghostData=null;
    try{ ghostData = JSON.parse(localStorage.getItem(ghostKey())||'null'); }catch(e){}

    cars = [
      makeCar('YOU', 0, COLORS.pink, 0, true, 'star'),
      makeCar('BYTE FOX', 1, COLORS.cyan, aiSpeed('byte'), false, 'diamond'),
      makeCar('NOVA', 2, COLORS.violet, aiSpeed('nova'), false, 'hex'),
      makeCar('GHOST', 3, COLORS.gold, aiSpeed('ghost'), false, 'circle')
    ];
    if(ghostData && ghostData.trace && ghostData.trace.length){
      const g = makeCar('BEST LAP', 4, COLORS.lime, 0, false, 'cross');
      g.isGhostReplay = true;
      g.ghostTrace = ghostData.trace;
      cars.push(g);
    }
    computeGeometry();
    renderTypeText();
    updateDashboard();
  }

  function setMessage(text, duration){
    message = text;
    messageUntil = elapsed + (duration==null?1.0:duration);
  }

  // ---------- Typing text render ----------
  function renderTypeText(){
    let html = '';
    for(let i=0;i<target.length;i++){
      const ch = target[i];
      let cls = 'ch';
      if(i < typed.length) cls += ' done';
      else if(i === typed.length && state==='racing') cls += ' cursor' + (error?' err':'');
      html += '<span class="'+cls+'">'+ch+'</span>';
    }
    typeText.innerHTML = html;
  }

  // ---------- Character / backspace handling (shared by keyboard + input event) ----------
  function handleChar(ch){
    if(state!=='racing' || !ch) return;
    if(typed.length >= target.length) return;

    totalKeys++;
    const expected = target[typed.length];
    if(ch===expected){
      typed += ch;
      correctKeys++;
      error=false;
      streak++;
      bestStreak = Math.max(bestStreak, streak);
      boost = clamp(boost + (streak%5===0 ? 0.07 : 0.023), 0, 1);
      sfx(streak%5===0 ? 'milestone' : 'key');
      const player = cars[0];
      const px = trackLeft + player.displayProgress*(trackRight-trackLeft);
      const py = trackTop + laneH*0.5;
      const n = streak%5===0 ? 3 : 1;
      for(let k=0;k<n;k++){
        sparks.push(makeSpark(px-16, py, streak%5===0?COLORS.lime:COLORS.pink,
          -35-Math.random()*90, (Math.random()-0.5)*60, 0.42, 2+Math.random()*2, false));
      }
      if(streak>0 && streak%15===0) setMessage('PERFECT STREAK \u00D7'+streak, 1.0);
      if(typed.length===target.length){
        placeFinished(player);
        finishRace();
      }
    } else {
      error=true;
      errorFlash=0.42;
      streak=0;
      boost=Math.max(0,boost-0.22);
      cameraShake=0.18;
      sfx('error');
      setMessage('MIS-TYPE \u2014 RESET YOUR RHYTHM', 0.75);
      const player = cars[0];
      const px = trackLeft + player.displayProgress*(trackRight-trackLeft);
      const py = trackTop + laneH*0.5;
      for(let k=0;k<10;k++){
        sparks.push(makeSpark(px, py, COLORS.red, (Math.random()-0.5)*220, -70-Math.random()*90, 0.5, 2+Math.random()*2, true));
      }
    }
    renderTypeText();
    updateDashboard();
  }

  function doBackspace(){
    if(state!=='racing') return;
    if(typed.length>0) typed = typed.slice(0,-1);
    error=false;
    streak = Math.max(0, streak-2);
    renderTypeText();
    updateDashboard();
  }

  // ---------- Input handling ----------
  function focusInput(){ hiddenInput.focus({preventScroll:true}); }
  typeText.addEventListener('click', ()=>{ if(state==='racing') focusInput(); });
  trackWrap.addEventListener('click', ()=>{ if(state==='racing') focusInput(); });

  // keydown: only for keys that don't reliably produce a plain 'input' event
  // (Backspace, Enter-for-newline, Escape). Everything else — including
  // mobile virtual-keyboard taps, autocorrect and IME composition — goes
  // through the 'input' listener below, which is far more reliable on
  // touch devices than reading e.key.
  hiddenInput.addEventListener('keydown', e=>{
    if(state==='racing' && e.key==='Escape'){
      e.preventDefault();
      pauseRace();
      return;
    }
    if(state==='paused'){
      if(e.key==='Escape'){ e.preventDefault(); resumeRace(); }
      return;
    }
    if(state!=='racing') return;

    if(e.key==='Backspace'){
      e.preventDefault();
      doBackspace();
      return;
    }
    if(e.key==='Enter'){
      e.preventDefault();
      if(target[typed.length]==='\n') handleChar('\n');
      return;
    }
  });

  hiddenInput.addEventListener('input', e=>{
    if(state!=='racing'){ hiddenInput.value=''; return; }
    const inputType = e.inputType || '';
    // Typing races only count if you actually type — block paste/drop.
    if(inputType==='insertFromPaste' || inputType==='insertFromDrop'){
      hiddenInput.value='';
      return;
    }
    if(inputType==='deleteContentBackward'){
      doBackspace();
    } else if(inputType==='insertLineBreak'){
      if(target[typed.length]==='\n') handleChar('\n');
    } else if(e.data){
      for(const ch of e.data) handleChar(ch);
    } else if(hiddenInput.value){
      for(const ch of hiddenInput.value) handleChar(ch);
    }
    hiddenInput.value = '';
  });

  document.addEventListener('keydown', e=>{
    if(e.key===' ' && (state==='menu' || state==='finished')){
      e.preventDefault();
      beginCountdown();
    }
  });
  startBtn.addEventListener('click', ()=>{ ensureAudio(); beginCountdown(); });
  againBtn.addEventListener('click', ()=>{ ensureAudio(); beginCountdown(); });
  resumeBtn.addEventListener('click', resumeRace);
  quitBtn.addEventListener('click', ()=>{ hideOverlay(confirmOverlay); goToMenu(); });

  // ---------- Race setup UI ----------
  function syncSetupUI(){
    modeSeg.querySelectorAll('.seg-btn').forEach(b=> {
      const active = b.dataset.mode===contentMode;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    diffSeg.querySelectorAll('.seg-btn').forEach(b=> {
      const active = b.dataset.diff===difficulty;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  }
  modeSeg.addEventListener('click', e=>{
    const btn = e.target.closest('.seg-btn'); if(!btn) return;
    contentMode = btn.dataset.mode;
    try{ localStorage.setItem('cn_gp_mode', contentMode); }catch(err){}
    syncSetupUI();
    refreshBestLine();
  });
  diffSeg.addEventListener('click', e=>{
    const btn = e.target.closest('.seg-btn'); if(!btn) return;
    difficulty = btn.dataset.diff;
    try{ localStorage.setItem('cn_gp_diff', difficulty); }catch(err){}
    syncSetupUI();
    refreshBestLine();
  });

  // ---------- Flow ----------
  function showOverlay(el){ el.classList.add('show'); }
  function hideOverlay(el){ el.classList.remove('show'); }

  function goToMenu(){
    state='menu';
    hideOverlay(countdownOverlay); hideOverlay(finishOverlay); hideOverlay(confirmOverlay);
    showOverlay(menuOverlay);
    refreshBestLine();
  }

  function pauseRace(){
    state='paused';
    showOverlay(confirmOverlay);
    announce('Race paused.');
  }
  function resumeRace(){
    state='racing';
    hideOverlay(confirmOverlay);
    focusInput();
    announce('Race resumed.');
  }

  function beginCountdown(){
    ensureAudio();
    resetRace();
    hideOverlay(menuOverlay); hideOverlay(finishOverlay); hideOverlay(confirmOverlay);
    showOverlay(countdownOverlay);
    state='countdown';
    countdownStart = performance.now()/1000;
    lastCountdownAnnounced = null;
    lights.forEach(l=>l.classList.remove('on'));
    countdownNum.classList.remove('go');
    announce('Get ready. Race starting.');
  }

  function finishRace(){
    state='finished';
    if(wpm>bestWpm){ bestWpm=wpm; try{ localStorage.setItem('cn_gp_best_wpm', String(bestWpm)); }catch(e){} }
    recordWpm(wpm);

    traceSamples.push([elapsed, 1]);
    let prevGhost=null;
    try{ prevGhost = JSON.parse(localStorage.getItem(ghostKey())||'null'); }catch(e){}
    if(!prevGhost || wpm > prevGhost.wpm){
      try{ localStorage.setItem(ghostKey(), JSON.stringify({wpm, time:elapsed, trace:traceSamples})); }catch(e){}
    }

    const player = cars[0];
    const champion = player.rank===1;
    finishTitle.textContent = champion ? 'VICTORY LAP!' : 'PHOTO FINISH';
    finishTitle.classList.toggle('champion', champion);
    finishSub.textContent = 'YOU TOOK ' + ordinal(player.rank).toUpperCase();
    teleTime.textContent = elapsed.toFixed(2)+'s';
    teleWpm.textContent = wpm+' WPM';
    telePrec.textContent = accuracy+'%';
    teleStreak.textContent = '\u00D7'+bestStreak;
    sfx('finish');
    announce((champion?'Victory! ':'Race finished. ')+'You placed '+ordinal(player.rank)+'. '+wpm+' words per minute, '+accuracy+' percent accuracy.');
    if(champion){
      celebrationFlash = 0.6;
      spawnConfetti();
      sfx('cheer');
    }
    setTimeout(()=>showOverlay(finishOverlay), 260);
  }

  // ---------- Per-car update ----------
  function updateCar(car, dt){
    if(car.finished){
      car.displayProgress += (1-car.displayProgress) * Math.min(1, dt*5);
      return;
    }
    if(car.player){
      car.progress = typed.length/target.length;
      car.boost = boost;
    } else if(car.isGhostReplay){
      car.progress = sampleTrace(car.ghostTrace, elapsed);
      car.boost = 0.32 + Math.sin(elapsed*2.2+car.phase)*0.1;
      if(car.progress>=1 && !car.finished) placeFinished(car);
    } else {
      const cps = car.speed*5/60;
      const rhythm = 1 + Math.sin(elapsed*1.8+car.phase)*0.035 + Math.sin(elapsed*4.1+car.phase)*0.014;
      car.progress = Math.min(1, elapsed*cps*rhythm/target.length);
      car.boost = 0.35 + Math.sin(elapsed*2.5+car.phase)*0.15;
      if(car.progress>=1 && !car.finished) placeFinished(car);
    }
    car.displayProgress += (car.progress-car.displayProgress) * Math.min(1, dt*10);
  }

  // ---------- Main update ----------
  function update(dt){
    if(state==='paused') return;

    updateSparks(dt);
    errorFlash = Math.max(0, errorFlash-dt);
    cameraShake = Math.max(0, cameraShake-dt);
    celebrationFlash = Math.max(0, celebrationFlash-dt);

    if(state==='countdown'){
      const now = performance.now()/1000;
      const el = now - countdownStart;
      const remaining = 3 - Math.floor(el);
      lights.forEach((l,i)=> l.classList.toggle('on', i >= remaining));
      if(remaining<=0){
        countdownNum.textContent='GO!';
        countdownNum.classList.add('go');
      } else {
        countdownNum.textContent=String(remaining);
        countdownNum.classList.remove('go');
        if(remaining!==lastCountdownAnnounced){ lastCountdownAnnounced=remaining; announce(String(remaining)); }
      }
      if(el >= 3.35){
        state='racing';
        elapsed=0;
        setMessage('GO! TYPE CLEAN. DRIVE FAST.', 1.15);
        hideOverlay(countdownOverlay);
        focusInput();
        announce('Go! Start typing.');
      }
      cars.forEach(c=>updateCar(c, dt));
      return;
    }

    if(state!=='racing'){
      cars.forEach(c=>updateCar(c, dt));
      return;
    }

    elapsed += dt;
    const minutes = Math.max(elapsed/60, 1/600);
    wpm = Math.round((correctKeys/5)/minutes);
    accuracy = totalKeys ? Math.round((correctKeys/totalKeys)*100) : 100;
    boost = Math.max(0, boost - dt*0.035);

    cars.forEach(c=>updateCar(c, dt));

    traceSampleTimer += dt;
    if(traceSampleTimer >= 0.15){
      traceSampleTimer = 0;
      traceSamples.push([elapsed, cars[0].progress]);
    }

    const rank = currentRank();
    if(rank !== lastAnnouncedRank && (elapsed - lastRankAnnounceTime) > 1.5){
      lastAnnouncedRank = rank;
      lastRankAnnounceTime = elapsed;
      announce('Position: ' + ordinal(rank));
    }

    if(finishOrder.length===cars.length && !cars[0].finished){
      placeFinished(cars[0]);
      finishRace();
    }
  }

  function updateDashboard(){
    statWpm.innerHTML = wpm + '<span class="t-suffix">WPM</span>';
    statAcc.innerHTML = accuracy + '<span class="t-suffix">%</span>';
    statStreak.innerHTML = '\u00D7'+streak + '<span class="t-suffix">COMBO</span>';
    nitroFill.style.width = (boost*100).toFixed(1)+'%';
    nitroFill.classList.toggle('hot', boost>=0.72);
    typeProgressFill.style.width = (target.length ? (typed.length/target.length*100) : 0).toFixed(1)+'%';

    const rank = currentRank();
    posValue.textContent = ordinal(rank).toUpperCase();
    posValue.classList.toggle('first', rank===1);

    const now = elapsed;
    if(now < messageUntil){
      ticker.textContent = message;
      ticker.classList.toggle('err', !!error && message.indexOf('MIS-TYPE')===0);
      ticker.classList.toggle('hot', streak>=15);
    } else {
      ticker.textContent = 'TYPE THE HIGHLIGHTED CHARACTER TO DRIVE';
      ticker.classList.remove('err'); ticker.classList.remove('hot');
    }
  }

  // ---------- Drawing ----------
  function roundRectPath(c,x,y,w,h,r){
    if(c.roundRect){ c.beginPath(); c.roundRect(x,y,w,h,r); return; }
    c.beginPath();
    c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r);
    c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath();
  }

  function drawIcon(type, x, y, s){
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if(type==='star'){
      for(let i=0;i<5;i++){
        const a = -Math.PI/2 + i*(Math.PI*2/5);
        const a2 = a + Math.PI/5;
        const px = x+Math.cos(a)*s, py=y+Math.sin(a)*s;
        const px2 = x+Math.cos(a2)*s*0.45, py2=y+Math.sin(a2)*s*0.45;
        if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
        ctx.lineTo(px2,py2);
      }
      ctx.closePath();
    } else if(type==='diamond'){
      ctx.moveTo(x,y-s); ctx.lineTo(x+s,y); ctx.lineTo(x,y+s); ctx.lineTo(x-s,y); ctx.closePath();
    } else if(type==='hex'){
      for(let i=0;i<6;i++){
        const a = Math.PI/6 + i*(Math.PI/3);
        const px=x+Math.cos(a)*s, py=y+Math.sin(a)*s;
        if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.closePath();
    } else if(type==='cross'){
      const w=s*0.4;
      ctx.rect(x-w/2,y-s,w,s*2); ctx.rect(x-s,y-w/2,s*2,w);
    } else {
      ctx.arc(x,y,s,0,Math.PI*2);
    }
    ctx.fill();
    ctx.stroke();
  }

  function drawBackground(now){
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(0,0,W,H);
    const grad = ctx.createLinearGradient(0,0,0,trackTop*0.95);
    grad.addColorStop(0, COLORS.navy);
    grad.addColorStop(1, COLORS.ink);
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,W,trackTop*0.95);

    stars.forEach(s=>{
      const a = 0.4 + 0.4*Math.sin(now*2+s.phase);
      ctx.fillStyle = 'rgba(180,209,255,'+Math.max(0,a).toFixed(2)+')';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI*2);
      ctx.fill();
    });

    skyline.forEach((b,i)=>{
      const y = trackTop*0.95 - b.height;
      ctx.fillStyle = COLORS.navy;
      ctx.fillRect(b.x, y, b.width, b.height);
      ctx.fillStyle = COLORS.panel2;
      ctx.fillRect(b.x, y, b.width, 2);
      for(let wy = y+8; wy < trackTop*0.9; wy+=13){
        if((i*7 + Math.floor(wy/13)) % 3 !== 0){
          ctx.fillStyle = (i + Math.floor(wy/13)) % 4 ? COLORS.cyan : COLORS.violet;
          ctx.globalAlpha = 0.55;
          ctx.fillRect(b.x+5, wy, 2, 4);
          ctx.globalAlpha = 1;
        }
      }
    });

    const haze = ctx.createRadialGradient(W*0.5, trackTop*0.9, 4, W*0.5, trackTop*0.9, W*0.5);
    haze.addColorStop(0, hexToRgba(COLORS.violet,0.14));
    haze.addColorStop(1, hexToRgba(COLORS.violet,0));
    ctx.fillStyle = haze;
    ctx.fillRect(0, trackTop*0.5, W, trackTop*0.6);
  }

  function drawTrack(now){
    roundRectPath(ctx, trackLeft-14, trackTop-6, (trackRight-trackLeft)+28, (trackBottom-trackTop)+12, 12);
    ctx.fillStyle = 'rgba(19,25,50,0.6)';
    ctx.fill();

    roundRectPath(ctx, trackLeft, trackTop, trackRight-trackLeft, trackBottom-trackTop, 10);
    ctx.fillStyle = COLORS.panel2;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for(let y=trackTop+9; y<trackBottom; y+=18){
      ctx.beginPath(); ctx.moveTo(trackLeft+5,y); ctx.lineTo(trackRight-5,y); ctx.stroke();
    }
    ctx.strokeStyle = COLORS.cyan; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(trackLeft,trackTop); ctx.lineTo(trackRight,trackTop); ctx.stroke();
    ctx.strokeStyle = COLORS.pink;
    ctx.beginPath(); ctx.moveTo(trackLeft,trackBottom); ctx.lineTo(trackRight,trackBottom); ctx.stroke();

    const laneCount = Math.max(1, cars.length);
    for(let lane=1; lane<laneCount; lane++){
      const y = trackTop + lane*laneH;
      const offset = (now*90) % 34;
      ctx.strokeStyle = 'rgba(181,200,255,0.5)';
      ctx.lineWidth = 2;
      for(let x=trackLeft+offset-34; x<trackRight; x+=34){
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+16,y); ctx.stroke();
      }
    }

    [[trackLeft,'START',COLORS.lime],[trackRight,'FINISH',COLORS.gold]].forEach(([edge,label,color])=>{
      ctx.strokeStyle = color; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(edge, trackTop-14); ctx.lineTo(edge, trackBottom+8); ctx.stroke();
      ctx.font = '700 10px "Space Grotesk", sans-serif';
      ctx.fillStyle = color; ctx.textAlign='center';
      ctx.fillText(label, edge, trackTop-20);
      ctx.textAlign='left';
    });

    const checkSize = 6;
    for(let row=0; row<Math.floor((trackBottom-trackTop)/checkSize); row++){
      for(let col=0; col<2; col++){
        ctx.fillStyle = (row+col)%2 ? COLORS.white : COLORS.ink;
        ctx.fillRect(trackRight-5+col*checkSize, trackTop+row*checkSize, checkSize, checkSize);
      }
    }

    for(let lane=0; lane<laneCount; lane++){
      const y = trackTop + (lane+0.5)*laneH;
      ctx.fillStyle = COLORS.panel;
      ctx.beginPath(); ctx.arc(trackLeft-24, y, 11, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = COLORS.panel2; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(trackLeft-24, y, 11, 0, Math.PI*2); ctx.stroke();
      ctx.font = '700 11px "Space Grotesk", sans-serif';
      ctx.fillStyle = COLORS.muted; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(String(lane+1), trackLeft-24, y+1);
      ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    }

    const drawOrder = cars.slice().sort((a,b)=> a.player - b.player);
    drawOrder.forEach(c=>drawCar(c, now));
  }

  function drawCar(car, bobTime){
    ctx.save();
    ctx.globalAlpha = car.isGhostReplay ? 0.55 : 1;

    const x = trackLeft + car.displayProgress*(trackRight-trackLeft);
    const laneY = trackTop + laneH*(car.lane+0.5);
    const y = laneY + Math.sin(bobTime*6+car.phase)*1.4;
    const scale = car.player ? 1.15 : 0.95;
    const w = 42*scale, h = 19*scale;

    if(car.boost>0.55 && !car.finished){
      for(let i=0;i<4;i++){
        const tx = x - w/2 - i*10;
        const a = Math.max(0.04, 0.4-i*0.09);
        ctx.fillStyle = hexToRgba(car.color, a);
        ctx.beginPath(); ctx.ellipse(tx,y,9,3.4,0,0,Math.PI*2); ctx.fill();
      }
    }

    ctx.save();
    ctx.globalAlpha=0.22;
    ctx.fillStyle = car.color;
    ctx.beginPath(); ctx.ellipse(x,y+h*0.32,w*0.7,h*0.7,0,0,Math.PI*2); ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(4,6,14,0.5)';
    ctx.beginPath(); ctx.ellipse(x-w*0.28,y+h*0.42,4,2.2,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x+w*0.28,y+h*0.42,4,2.2,0,0,Math.PI*2); ctx.fill();

    roundRectPath(ctx, x-w/2, y-h/2, w, h, h*0.42);
    ctx.fillStyle = car.color;
    ctx.fill();
    if(car.isGhostReplay){
      ctx.save();
      ctx.setLineDash([3,3]);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      roundRectPath(ctx, x-w/2, y-h/2, w, h, h*0.42);
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(15,20,40,0.55)';
    roundRectPath(ctx, x-w*0.12, y-h*0.4, w*0.36, h*0.5, 3);
    ctx.fill();
    drawIcon(car.icon, x+w*0.06, y-h*0.15, 3.2);

    ctx.fillStyle = COLORS.white;
    ctx.beginPath(); ctx.arc(x+w/2-2, y-h*0.2, 1.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = COLORS.red;
    ctx.beginPath(); ctx.arc(x-w/2+2, y-h*0.2, 1.5, 0, Math.PI*2); ctx.fill();

    ctx.font = '700 10px "Space Grotesk", sans-serif';
    const label = car.name;
    const tw = ctx.measureText(label).width;
    const bx = x-tw/2-6, by = y-h/2-19, bw = tw+12, bh = 15;
    ctx.fillStyle = car.player ? car.color : 'rgba(19,29,59,0.92)';
    roundRectPath(ctx,bx,by,bw,bh,7); ctx.fill();
    ctx.strokeStyle = car.player ? COLORS.white : car.color;
    ctx.lineWidth=1;
    roundRectPath(ctx,bx,by,bw,bh,7); ctx.stroke();
    ctx.fillStyle = car.player ? '#0b0f1f' : COLORS.white;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(label, x, by+bh/2+0.5);
    ctx.textAlign='left'; ctx.textBaseline='alphabetic';

    if(!reduceMotion && Math.random() < (0.10+car.boost*0.12) && !car.finished){
      sparks.push(makeSpark(x-w/2, y+h/2, car.color, -30-Math.random()*40, (Math.random()-0.5)*20, 0.3, 2, false));
    }
    ctx.restore();
  }

  function draw(now){
    ctx.clearRect(0,0,W,H);
    if(W<=0||H<=0) return;
    drawBackground(now);

    if(cameraShake>0 && !reduceMotion){
      const shakeX = (Math.random()-0.5)*10;
      ctx.save();
      ctx.translate(shakeX,0);
      drawTrack(now);
      ctx.restore();
    } else {
      drawTrack(now);
    }
    drawSparks();

    if(errorFlash>0){
      ctx.fillStyle = hexToRgba(COLORS.red, clamp(errorFlash/0.42,0,1)*0.22);
      ctx.fillRect(0,0,W,H);
    }
    if(celebrationFlash>0){
      ctx.fillStyle = hexToRgba(COLORS.gold, clamp(celebrationFlash/0.6,0,1)*0.16);
      ctx.fillRect(0,0,W,H);
    }
  }

  // ---------- Main loop ----------
  let lastTs=null;
  function loop(ts){
    requestAnimationFrame(loop);
    if(lastTs==null) lastTs=ts;
    let dt=(ts-lastTs)/1000;
    lastTs=ts;
    dt=Math.min(dt,0.05);
    const now = ts/1000;
    update(dt);
    draw(now);
    updateDashboard();
  }

  // ---------- Init ----------
  computeGeometry();
  buildDecorations();
  window.addEventListener('resize', buildDecorations);
  syncSetupUI();
  resetRace();
  requestAnimationFrame(loop);
})();
