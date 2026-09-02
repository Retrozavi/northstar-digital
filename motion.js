/* =====================================================================
   NORTHSTAR DIGITAL — motion engine

   One scroll value drives everything. There is exactly one rAF loop and
   exactly one source of truth, so the film, the acts, the orrery and the
   nav can never disagree about where the reader is.

   Layers:
     1. smoother      wheel -> lerped window scroll (pointer devices only)
     2. stage         document progress -> video playhead + ground state
     3. acts          per-act progress -> --p on the act element
     4. orrery        scroll -> orbit rotation -> per-node docking
     5. peak          act progress -> the lead journey builds itself
     6. reveals       IntersectionObserver, one-way
   ===================================================================== */
(function () {
  'use strict';

  var doc  = document.documentElement;
  var body = document.body;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse  = window.matchMedia('(pointer: coarse)').matches;
  var narrow  = function () { return window.innerWidth <= 760; };

  /* acts are only pinned where CSS actually pins them */
  var cinematic = !reduced && !narrow();

  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp  = function (a, b, t) { return a + (b - a) * t; };
  /* ease used wherever something should arrive rather than slide to a stop */
  var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };

  /* =====================================================================
     1 · SMOOTHER
     Wheel is intercepted and fed through a lerp into the real scroll
     position, so position:sticky, the scrollbar and anchor offsets all
     keep working. Touch and keyboard stay native on purpose.
     ===================================================================== */
  var smooth = {
    on: !reduced && !coarse,
    target: 0,
    current: 0,
    running: false,
    paused: false,
    ease: 0.075
  };

  function maxScroll() {
    return Math.max(0, doc.scrollHeight - window.innerHeight);
  }

  function inNativeScroller(node) {
    while (node && node !== body) {
      if (node.hasAttribute && node.hasAttribute('data-native-scroll')) return true;
      node = node.parentNode;
    }
    return false;
  }

  function onWheel(e) {
    if (!smooth.on || e.ctrlKey) return;
    if (inNativeScroller(e.target)) return;
    if (smooth.paused) { e.preventDefault(); return; }

    var d = e.deltaY;
    if (e.deltaMode === 1) d *= 16;
    else if (e.deltaMode === 2) d *= window.innerHeight;

    e.preventDefault();
    smooth.target = clamp(smooth.target + d, 0, maxScroll());
    smooth.running = true;
  }

  function glideTo(y) {
    smooth.target = clamp(y, 0, maxScroll());
    smooth.running = true;
  }

  if (smooth.on) {
    doc.classList.add('has-smooth');
    smooth.target = smooth.current = window.scrollY;
    window.addEventListener('wheel', onWheel, { passive: false });

    /* anchors ease through the same pipe instead of teleporting */
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href');
      if (id.length < 2) return;
      var dest = document.querySelector(id);
      if (!dest) return;
      e.preventDefault();
      var navH = document.querySelector('.nav').offsetHeight;
      glideTo(dest.getBoundingClientRect().top + window.scrollY - navH + 1);
      if (history.pushState) history.pushState(null, '', id);
    });
  }

  /* =====================================================================
     2 · STAGE — the film and the ground it casts
     ===================================================================== */
  var stage   = document.querySelector('.stage');
  var video   = document.getElementById('stageVideo');
  var standin = document.getElementById('stageStandin');

  var film = {
    ready: false,
    duration: 0,
    scrubbing: !coarse && !reduced,
    lastSet: -1
  };

  function useStandin() {
    if (stage.classList.contains('is-standin')) return;
    stage.classList.add('is-standin');
    initStandin();
  }

  if (video) {
    video.addEventListener('loadedmetadata', function () {
      if (!video.duration || !isFinite(video.duration)) { useStandin(); return; }
      film.ready = true;
      film.duration = video.duration;
      if (film.scrubbing) {
        video.pause();
      } else {
        video.loop = true;
        var p = video.play();
        if (p && p.catch) p.catch(function () { /* autoplay refused; frame one still shows */ });
      }
    });
    video.addEventListener('error', useStandin);
    /* a missing file never fires loadedmetadata — fall back on our own clock */
    setTimeout(function () { if (!film.ready) useStandin(); }, 2500);
  } else {
    useStandin();
  }

  function driveFilm(p) {
    if (!film.ready || !film.scrubbing) return;
    var t = p * (film.duration - 0.05);
    if (video.seeking) return;
    if (Math.abs(t - film.lastSet) < 0.032) return;
    film.lastSet = t;
    try { video.currentTime = t; } catch (err) { /* seek races are survivable */ }
  }

  /* ---- the stand-in stage, for when there is no video file yet ----
     Rendered small and scaled up: it reads as soft film grain rather
     than as a canvas, and costs almost nothing per frame.             */
  var sc = null, scCtx = null, scStars = null;

  function initStandin() {
    if (!standin) return;
    sc = standin;
    sc.width = 420; sc.height = 760;
    scCtx = sc.getContext('2d');
    scStars = [];
    for (var i = 0; i < 130; i++) {
      scStars.push({
        x: Math.random(), y: Math.random(),
        r: 0.4 + Math.random() * 1.5,
        a: 0.2 + Math.random() * 0.7,
        d: 0.3 + Math.random() * 1.4
      });
    }
  }

  function drawStandin(p, time) {
    if (!scCtx) return;
    var w = sc.width, h = sc.height;
    var g;

    scCtx.fillStyle = getComputedStyle(doc).getPropertyValue('--stage-base').trim() || '#07070a';
    scCtx.fillRect(0, 0, w, h);

    /* a core that rises and warms as the argument advances */
    var cx = w * (0.62 - p * 0.18);
    var cy = h * (0.68 - p * 0.34);
    g = scCtx.createRadialGradient(cx, cy, 0, cx, cy, h * (0.42 + p * 0.3));
    g.addColorStop(0,   'rgba(45,150,255,' + (0.42 + p * 0.2) + ')');
    g.addColorStop(0.45,'rgba(20,80,170,0.16)');
    g.addColorStop(1,   'rgba(10,10,14,0)');
    scCtx.fillStyle = g;
    scCtx.fillRect(0, 0, w, h);

    g = scCtx.createRadialGradient(w * 0.14, h * 0.22, 0, w * 0.14, h * 0.22, h * 0.4);
    g.addColorStop(0, 'rgba(120,180,255,' + (0.14 + p * 0.1) + ')');
    g.addColorStop(1, 'rgba(10,10,14,0)');
    scCtx.fillStyle = g;
    scCtx.fillRect(0, 0, w, h);

    /* the field drifts with scroll, and only breathes on its own */
    for (var i = 0; i < scStars.length; i++) {
      var s = scStars[i];
      var y = (s.y - p * 0.22 * s.d) % 1;
      if (y < 0) y += 1;
      var tw = 0.72 + 0.28 * Math.sin(time * 0.0011 * s.d + i);
      scCtx.beginPath();
      scCtx.arc(s.x * w, y * h, s.r, 0, 6.2832);
      scCtx.fillStyle = 'rgba(217,231,247,' + (s.a * tw).toFixed(3) + ')';
      scCtx.fill();
    }

    /* horizon */
    g = scCtx.createLinearGradient(0, h * (0.72 - p * 0.2), 0, h);
    g.addColorStop(0, 'rgba(25,136,255,0)');
    g.addColorStop(1, 'rgba(25,136,255,' + (0.16 + p * 0.12) + ')');
    scCtx.fillStyle = g;
    scCtx.fillRect(0, 0, w, h);
  }

  /* =====================================================================
     2b · THE FIELD
     Small north stars behind the whole page. Each one drifts on its own
     slow clock and is carried further by scroll, at its own depth, so the
     field has parallax rather than one flat sheet of dots.
     ===================================================================== */
  var fieldEl = document.getElementById('stageField');
  var fctx = null, stars = [], fieldW = 0, fieldH = 0, fieldDpr = 1;
  var starRGB = '217,231,247';

  /* read once per ground change rather than per star per frame */
  function readStarColour() {
    var v = getComputedStyle(doc).getPropertyValue('--star-rgb').trim();
    if (v) starRGB = v.replace(/\s+/g, ',');
  }

  function initField() {
    if (!fieldEl) return;
    fctx = fieldEl.getContext('2d');
    readStarColour();
    fieldDpr = Math.min(window.devicePixelRatio || 1, 1.75);
    sizeField();
    stars = [];
    var n = Math.round(Math.min(150, Math.max(55, window.innerWidth / 11)));
    for (var i = 0; i < n; i++) {
      var depth = 0.25 + Math.random() * 1.35;   /* nearer stars move more */
      stars.push({
        x: Math.random(),
        y: Math.random(),
        r: (0.7 + Math.random() * 2.5) * depth,
        depth: depth,
        star: Math.random() < 0.34,               /* a third are four-point marks */
        drift: (Math.random() - 0.5) * 0.012,
        phase: Math.random() * 6.283,
        tw: 0.5 + Math.random() * 1.6,
        a: 0.2 + Math.random() * 0.62
      });
    }
  }

  function sizeField() {
    if (!fieldEl) return;
    fieldW = window.innerWidth; fieldH = window.innerHeight;
    fieldEl.width  = Math.round(fieldW * fieldDpr);
    fieldEl.height = Math.round(fieldH * fieldDpr);
    if (fctx) fctx.setTransform(fieldDpr, 0, 0, fieldDpr, 0, 0);
  }

  /* a four-point north star, drawn as two crossed tapers */
  function northStar(c, x, y, r) {
    c.beginPath();
    c.moveTo(x, y - r);
    c.quadraticCurveTo(x + r * 0.16, y - r * 0.16, x + r, y);
    c.quadraticCurveTo(x + r * 0.16, y + r * 0.16, x, y + r);
    c.quadraticCurveTo(x - r * 0.16, y + r * 0.16, x - r, y);
    c.quadraticCurveTo(x - r * 0.16, y - r * 0.16, x, y - r);
    c.closePath();
    c.fill();
  }

  function drawField(y, time) {
    if (!fctx) return;
    fctx.clearRect(0, 0, fieldW, fieldH);
    var t = time * 0.001;

    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      /* scroll carries it, its own drift keeps it alive when nothing moves */
      var sy = (s.y - (y * 0.00016 * s.depth) - t * 0.0022 * s.depth) % 1;
      if (sy < 0) sy += 1;
      var sx = (s.x + Math.sin(t * 0.12 + s.phase) * 0.006 + t * s.drift * 0.02) % 1;
      if (sx < 0) sx += 1;

      var twinkle = 0.62 + 0.38 * Math.sin(t * s.tw + s.phase);
      var alpha = s.a * twinkle;
      var px = sx * fieldW, py = sy * fieldH;

      if (s.star) {
        fctx.fillStyle = 'rgba(' + starRGB + ',' + (alpha * 0.9).toFixed(3) + ')';
        northStar(fctx, px, py, s.r * 2.4);
      } else {
        fctx.beginPath();
        fctx.arc(px, py, s.r * 0.6, 0, 6.2832);
        fctx.fillStyle = 'rgba(' + starRGB + ',' + alpha.toFixed(3) + ')';
        fctx.fill();
      }
    }
  }

  /* =====================================================================
     3 · ACTS
     ===================================================================== */
  var acts = [].map.call(document.querySelectorAll('[data-act]'), function (el) {
    el.style.setProperty('--act-scroll', el.dataset.scroll || 2);
    return { el: el, pin: el.querySelector('.act__pin'), p: -1, top: 0, len: 1, pinned: true };
  });

  var calmEl  = document.querySelector('.calm');
  var peakAct = document.querySelector('[data-act="peak"]');
  var journey = document.querySelector('.journey');
  var jDraw   = [].slice.call(document.querySelectorAll('.jd'));
  var jFlow   = [].slice.call(document.querySelectorAll('.jf'));
  var jWord   = [].slice.call(document.querySelectorAll('.jw'));

  jDraw.forEach(function (el) {
    el._len = parseFloat(el.style.getPropertyValue('--len')) || 100;
    el._step = parseInt(el.dataset.step, 10) || 0;
  });
  jFlow.forEach(function (el) { el._step = parseInt(el.dataset.step, 10) || 0; });
  jWord.forEach(function (el) { el._step = parseInt(el.dataset.step, 10) || 0; });

  /* geometry is measured, never assumed — recomputed on resize and on
     every image/font that changes layout */
  var calmStart = 0, calmEnd = 1;

  function measure() {
    var vh = window.innerHeight;
    acts.forEach(function (a) {
      /* measure unpinned first, so a frame that cannot hold its content
         is caught before it clips anything.

         scrollHeight alone is not enough: engines disagree about whether
         padding-bottom counts, so a borderline act stayed pinned and the
         centred content lost its top edge under the nav. Measure the real
         content box plus both paddings, and keep a margin. */
      a.el.classList.remove('is-unpinned');
      var cs = getComputedStyle(a.pin);
      var padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      var inner = a.pin.firstElementChild;
      /* content height only. scrollHeight is no use here: a pinned frame is
         height:100svh, so it reports the frame rather than what is in it. */
      var need = (inner ? inner.getBoundingClientRect().height : 0) + padY;
      var fits = cinematic && need > 0 && need <= vh - 16;
      a.pinned = fits;
      if (!fits) a.el.classList.add('is-unpinned');

      var r = a.el.getBoundingClientRect();
      a.top = r.top + window.scrollY;
      a.len = Math.max(1, a.el.offsetHeight - vh);
    });
    measureNav();

    var heroA = acts[0];
    if (heroA) {
      orbitFrom = heroA.top;
      orbitRate = (ORBIT_TURNS * 360) / Math.max(1, heroA.pinned ? heroA.len : heroA.el.offsetHeight);
    }

    if (calmEl) {
      var ct = calmEl.getBoundingClientRect().top + window.scrollY;
      calmStart = Math.max(0, ct - vh * 1.25);
      calmEnd   = Math.max(calmStart + 1, ct - vh * 0.15);
    } else {
      calmStart = maxScroll() * 0.7;
      calmEnd   = maxScroll();
    }
  }

  /* =====================================================================
     4 · ORRERY — the signature move
     ===================================================================== */
  var orrery = document.querySelector('.orrery');
  var tracks = [];
  if (orrery) {
    tracks = [].map.call(orrery.querySelectorAll('.track'), function (t) {
      return {
        el: t,
        rev: parseFloat(t.dataset.rev) || 1,
        rate: parseFloat(t.dataset.rate) || 1,
        nodes: [].map.call(t.querySelectorAll('.node'), function (n) {
          var ang = parseFloat(n.dataset.ang) || 0;
          var dock = parseFloat(n.dataset.dock) || 0;
          n.style.setProperty('--ang', ang);
          /* a card always opens away from the centre. The side is fixed by
             where the node docks, so nothing has to be rewritten per frame. */
          n.setAttribute('data-open', Math.cos(dock * Math.PI / 180) >= 0 ? 'right' : 'left');
          return { el: n, ang: ang, dock: dock, last: -1 };
        })
      };
    });
  }

  var DOCK_WINDOW = 60;   /* degrees either side of its dock that a card is open */
  /* degrees of orbit per pixel of scroll — set in measure() so the outer
     track completes exactly ORBIT_TURNS revolutions across the hero act.
     Three nodes 120deg apart means one turn is three cards; the inner track
     runs faster and backwards, so seven cards open before the hero lets go. */
  var ORBIT_TURNS = 1.05;
  var orbitRate = 0.1385;
  var orbitFrom = 0;

  function angleDelta(a, b) {
    var d = ((a - b) % 360 + 540) % 360 - 180;
    return Math.abs(d);
  }

  function driveOrrery(scrollY) {
    if (!orrery || !tracks.length) return;
    var base = (scrollY - orbitFrom) * orbitRate;
    for (var i = 0; i < tracks.length; i++) {
      var t = tracks[i];
      var spin = base * t.rate * t.rev;
      t.el.style.setProperty('--spin', spin.toFixed(2));

      for (var j = 0; j < t.nodes.length; j++) {
        var n = t.nodes[j];
        var dist = angleDelta(n.ang + spin, n.dock);
        var open = dist >= DOCK_WINDOW ? 0 : easeOut(1 - dist / DOCK_WINDOW);
        if (open !== n.last) {
          n.last = open;
          n.el.style.setProperty('--dock', open.toFixed(3));
        }
      }
    }
  }

  /* =====================================================================
     5 · THE PEAK — the lead journey builds itself
     ===================================================================== */
  var SILENCE = 0.05;    /* a beat, not a wait — the diagram starts almost at once */
  var SETTLE  = 0.85;    /* finished before the act releases, with a beat to read it */

  function drivePeak(p) {
    if (!journey) return;

    var span = SETTLE - SILENCE;
    var each = span / 6;

    for (var i = 0; i < jDraw.length; i++) {
      var el = jDraw[i];
      var s = SILENCE + el._step * each;
      var e = easeOut(clamp((p - s) / (each * 1.35), 0, 1));
      el.style.strokeDashoffset = (el._len * (1 - e)).toFixed(2);
    }
    for (var k = 0; k < jWord.length; k++) {
      var w = jWord[k];
      var ws = SILENCE + w._step * each + each * 0.45;
      w.style.opacity = clamp((p - ws) / (each * 0.9), 0, 1).toFixed(3);
    }
    for (var m = 0; m < jFlow.length; m++) {
      var f = jFlow[m];
      var fs = SILENCE + f._step * each + each * 0.2;
      f.style.opacity = clamp((p - fs) / (each * 0.8), 0, 1).toFixed(3);
    }

    journey.classList.toggle('is-lit', p >= SETTLE);
  }

  /* flowing dashes are tied to scroll too — nothing on this page moves
     unless the reader moves it */
  function driveFlowDash(scrollY) {
    var off = -(scrollY * 0.14) % 28;
    for (var i = 0; i < jFlow.length; i++) jFlow[i].style.strokeDashoffset = off.toFixed(2);
  }

  /* =====================================================================
     NAV
     ===================================================================== */
  var nav = document.querySelector('.nav');
  var navLinks = [].slice.call(document.querySelectorAll('.navlink[data-navfor]'));
  var navSections = navLinks.map(function (l) {
    return { id: l.dataset.navfor, el: document.getElementById(l.dataset.navfor), top: 0 };
  }).filter(function (s) { return s.el; });
  var lastY = 0, navHidden = false, activeId = '';

  function measureNav() {
    for (var i = 0; i < navSections.length; i++) {
      navSections[i].top = navSections[i].el.getBoundingClientRect().top + window.scrollY;
    }
  }

  function driveNav(scrollY) {
    var down = scrollY > lastY + 1.5;
    var up   = scrollY < lastY - 1.5;
    if (down && scrollY > 140 && !navHidden) { nav.classList.add('is-hidden'); navHidden = true; }
    else if ((up || scrollY <= 140) && navHidden) { nav.classList.remove('is-hidden'); navHidden = false; }
    lastY = scrollY;

    /* active section = whatever owns the upper third of the viewport */
    var probe = scrollY + vh * 0.34;
    var found = '';
    for (var i = 0; i < navSections.length; i++) {
      if (probe >= navSections[i].top) found = navSections[i].id;
    }
    if (found !== activeId) {
      activeId = found;
      navLinks.forEach(function (l) { l.classList.toggle('is-active', l.dataset.navfor === activeId); });
    }
  }

  /* =====================================================================
     6 · REVEALS
     ===================================================================== */
  [].forEach.call(document.querySelectorAll('[data-seq]'), function (el) {
    el.style.setProperty('--seq', el.dataset.seq);
  });

  /* siblings stagger; the index is assigned per parent so unrelated
     groups never inherit each other's delay */
  [].forEach.call(document.querySelectorAll('.reveal'), function (el) {
    var parent = el.parentNode;
    if (parent._revIdx === undefined) parent._revIdx = 0;
    el.style.setProperty('--i', parent._revIdx++);
  });

  [].forEach.call(document.querySelectorAll('.hero__title .line, .peak__title .line'), function (el, i) {
    el.style.setProperty('--i', i);
  });

  var watched = [].slice.call(document.querySelectorAll('.reveal, .stages, .hero__title, .peak__title, .draw'));

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    watched.forEach(function (el) { io.observe(el); });
  } else {
    watched.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* =====================================================================
     THE LOOP
     ===================================================================== */
  var vh = window.innerHeight;

  function update(time) {
    var y = window.scrollY;

    /* --- acts --- */
    var peakP = 0, peakPinned = false;
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      var p = a.pinned ? clamp((y - a.top) / a.len, 0, 1)
                       : (y + vh * 0.55 > a.top ? 1 : 0);
      if (p !== a.p) {
        a.p = p;
        a.el.style.setProperty('--p', p.toFixed(4));
      }
      if (a.el === peakAct) { peakP = p; peakPinned = a.pinned; }
    }

    /* --- ground state --- */
    var calmP = clamp((y - calmStart) / (calmEnd - calmStart), 0, 1);
    /* the peak darkens the room; the calm empties it for good */
    var peakDim = clamp(peakP * 3.2, 0, 1) * 0.46;
    var dim = Math.max(peakDim, calmP);
    var heroP = acts.length ? acts[0].p : 0;

    doc.style.setProperty('--scene-dim', dim.toFixed(3));
    doc.style.setProperty('--scene-blur', (peakDim * 9 * (1 - calmP)).toFixed(2) + 'px');
    doc.style.setProperty('--scene-scale', (1.06 - heroP * 0.06 + calmP * 0.05).toFixed(4));

    /* --- film --- */
    var filmP = clamp(y / Math.max(1, calmEnd), 0, 1);
    driveFilm(filmP);
    drawField(y, time);
    if (scCtx && dim < 0.995) drawStandin(filmP, time);

    /* --- the rest --- */
    if (!reduced) {
      driveOrrery(y);
      driveFlowDash(y);
    }
    if (peakPinned) drivePeak(peakP);
    driveNav(y);
  }

  /* rAF drives the smoothing; the scroll event is the safety net. If a
     frame is dropped or throttled, the page still matches where the
     reader actually is rather than where it last managed to draw. */
  function frame(time) {
    if (smooth.on && smooth.running && !smooth.paused) {
      smooth.current = lerp(smooth.current, smooth.target, smooth.ease);
      if (Math.abs(smooth.target - smooth.current) < 0.4) {
        smooth.current = smooth.target;
        smooth.running = false;
      }
      window.scrollTo(0, smooth.current);
    } else {
      smooth.current = smooth.target = window.scrollY;
    }
    update(time);
    requestAnimationFrame(frame);
  }

  window.addEventListener('scroll', function () {
    var y = window.scrollY;
    /* if anything other than the smoother moved the page — a scrollbar
       drag, a keypress, the browser restoring a position — hand control
       straight back rather than dragging the reader to our old target */
    if (smooth.running && Math.abs(y - smooth.current) > 6) smooth.running = false;
    if (!smooth.running) {
      smooth.current = smooth.target = y;
      update(performance.now());
    }
  }, { passive: true });

  /* =====================================================================
     BOOT
     ===================================================================== */
  function refresh() {
    vh = window.innerHeight;
    if (!fctx) initField(); else sizeField();
    cinematic = !reduced && !narrow();
    measure();
    var peakA = acts.filter(function (a) { return a.el === peakAct; })[0];
    if (journey && (!peakA || !peakA.pinned)) {
      /* un-pinned: show the diagram whole rather than half-built */
      jDraw.forEach(function (el) { el.style.strokeDashoffset = 0; });
      jWord.forEach(function (el) { el.style.opacity = 1; });
      jFlow.forEach(function (el) { el.style.opacity = 1; });
      journey.classList.add('is-lit');
    }
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refresh, 140);
  });
  window.addEventListener('load', refresh);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);

  refresh();
  requestAnimationFrame(frame);

  /* =====================================================================
     FORM
     ===================================================================== */
  var form   = document.getElementById('inquiryForm');
  var done   = document.getElementById('inquiryDone');
  var resetB = document.getElementById('inquiryReset');
  var chips  = document.getElementById('budgetChips');
  var budget = document.getElementById('budgetValue');

  if (chips) {
    chips.addEventListener('click', function (e) {
      var b = e.target.closest('.bchip');
      if (!b) return;
      var on = b.classList.contains('is-on');
      [].forEach.call(chips.querySelectorAll('.bchip'), function (c) { c.classList.remove('is-on'); });
      if (!on) { b.classList.add('is-on'); budget.value = b.dataset.budget; }
      else { budget.value = ''; }
    });
  }

  /* =====================================================================
     WHERE THE INQUIRY GOES
     Set FORM_ENDPOINT to a Formspree or Web3Forms URL and submissions post
     straight to it. Until then the form falls back to opening a pre-filled
     email — it never pretends to have sent something it did not send.
     ===================================================================== */
  var CONTACT_EMAIL  = 'digitalzaviofficial@gmail.com';
  var FORM_ENDPOINT  = 'https://formspree.io/f/xrpgkkdq';
  var BOOKING_URL    = 'https://app.notion.com/p/5051c51506554980acd56018eacf4add?v=15e2a9d1c81942fd9d144d0f18e8e79b&source=copy_link';

  var bookingLink = document.getElementById('bookingLink');
  if (bookingLink && BOOKING_URL) {
    bookingLink.href = BOOKING_URL;
    bookingLink.target = '_blank';
    bookingLink.rel = 'noopener';
  }

  function inquiryFields() {
    var f = {};
    ['name','business','email','phone','industry','team','budget','problem'].forEach(function (k) {
      var el = form.elements[k];
      if (el) f[k] = (el.value || '').trim();
    });
    return f;
  }

  function mailtoFallback(f) {
    var lines = [
      'Name: '     + (f.name     || '-'),
      'Business: ' + (f.business || '-'),
      'Email: '    + (f.email    || '-'),
      'Phone: '    + (f.phone    || '-'),
      'Industry: ' + (f.industry || '-'),
      'Team size: '+ (f.team     || '-'),
      'Budget: '   + (f.budget   || '-'),
      '',
      'What they want fixed:',
      f.problem || '-'
    ].join('\n');
    window.location.href = 'mailto:' + CONTACT_EMAIL +
      '?subject=' + encodeURIComponent('Project inquiry — ' + (f.name || 'website')) +
      '&body='    + encodeURIComponent(lines);
  }

  function showSent() {
    form.hidden = true;
    done.hidden = false;
    refresh();
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = inquiryFields();

      /* a way to reach them is the one thing actually required */
      if (!f.email && !f.phone) {
        var em = form.elements.email;
        if (em) { em.focus(); em.setAttribute('aria-invalid', 'true'); }
        var warn = document.getElementById('inquiryWarn');
        if (warn) warn.hidden = false;
        return;
      }
      var warn2 = document.getElementById('inquiryWarn');
      if (warn2) warn2.hidden = true;

      var btn = form.querySelector('.inquiry__submit');
      if (!FORM_ENDPOINT) { mailtoFallback(f); showSent(); return; }

      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(Object.assign({ _subject: 'Project inquiry — ' + (f.name || 'website') }, f))
      }).then(function (r) {
        if (!r.ok) throw new Error('bad status ' + r.status);
        showSent();
      }).catch(function () {
        /* say so rather than showing a false success */
        mailtoFallback(f);
        showSent();
      });
    });
  }

  if (resetB) {
    resetB.addEventListener('click', function () {
      form.reset();
      if (budget) budget.value = '';
      if (chips) [].forEach.call(chips.querySelectorAll('.bchip'), function (c) { c.classList.remove('is-on'); });
      done.hidden = true;
      form.hidden = false;
      refresh();
    });
  }

  /* =====================================================================
     INTERACTION · service cards -> zoom sheet
     The deep copy stays in the document and is moved into the sheet on
     open, so it is never duplicated and never falls out of sync.
     ===================================================================== */
  var sheet     = document.getElementById('sheet');
  var sheetBody = document.getElementById('sheetBody');
  var sheetTitle= document.getElementById('sheetTitle');
  var sheetOpener = null;
  var sheetHome = null;   /* where the copy came from, so it can go back */
  var sheetNode = null;

  function openSheet(deepId, title, opener) {
    var deep = document.getElementById(deepId);
    if (!deep || !sheet) return;
    closeSheet(true);

    sheetOpener = opener || null;
    sheetHome = deep.parentNode;
    sheetNode = deep;
    sheetTitle.innerHTML = title;

    deep.hidden = false;
    sheetBody.appendChild(deep);
    sheet.hidden = false;
    void sheet.offsetWidth;   /* flush layout so the zoom has a start value */
    sheet.classList.add('is-open');

    smooth.paused = true;
    doc.classList.add('is-locked');
    var focusTarget = sheet.querySelector('.sheet__close');
    if (focusTarget) focusTarget.focus();
  }

  function closeSheet(immediate) {
    if (!sheet || sheet.hidden) return;
    sheet.classList.remove('is-open');
    var finish = function () {
      sheet.hidden = true;
      if (sheetNode && sheetHome) {          /* put the copy back where it lives */
        sheetNode.hidden = true;
        sheetHome.appendChild(sheetNode);
      }
      sheetNode = sheetHome = null;
      doc.classList.remove('is-locked');
      smooth.paused = false;
      if (sheetOpener) { sheetOpener.focus(); sheetOpener = null; }
    };
    if (immediate || reduced) finish();
    else setTimeout(finish, 300);
  }

  if (sheet) {
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-sheet-close]')) { closeSheet(); return; }

      var btn = e.target.closest('[data-open]');
      var card = e.target.closest('.card.is-clickable');
      if (!btn && !card) return;
      if (!btn) btn = card.querySelector('[data-open]');
      if (!btn) return;
      var host = btn.closest('.card');
      var title = host ? host.querySelector('.card__title').innerHTML : '';
      openSheet(btn.getAttribute('data-open'), title, btn);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !sheet.hidden) closeSheet();
      if (e.key !== 'Tab' || sheet.hidden) return;
      /* keep focus inside the dialog while it is open */
      var f = sheet.querySelectorAll('button, [href], details summary, input, textarea, [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    /* a card is clickable, but a real link or the details toggle inside it
       must still behave like itself */
    [].forEach.call(document.querySelectorAll('.card.is-clickable'), function (c) {
      c.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (e.target !== c) return;
        e.preventDefault();
        var b = c.querySelector('[data-open]');
        if (b) b.click();
      });
    });
  }

  /* =====================================================================
     INTERACTION · built for -> example scenarios
     ===================================================================== */
  [].forEach.call(document.querySelectorAll('.builtfor__btn'), function (btn) {
    var drop = document.getElementById(btn.getAttribute('aria-controls'));
    if (!drop) return;
    [].forEach.call(drop.querySelectorAll('li'), function (li, i) {
      li.style.setProperty('--li', i);
    });
    btn.addEventListener('click', function () {
      /* each category is its own switch — opening one leaves the rest alone */
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
      if (open) {
        drop.classList.remove('is-shown');
        drop.hidden = true;
      } else {
        drop.hidden = false;
        void drop.offsetWidth;
        drop.classList.add('is-shown');
      }
      refresh();
    });
  });

  /* =====================================================================
     INTERACTION · lead journey -> per-step detail
     Hover on a pointer, tap or keyboard focus everywhere else.
     ===================================================================== */
  var jtip = document.getElementById('jtip');
  var jhits = [].slice.call(document.querySelectorAll('.jh'));

  function showTip(rect) {
    if (!jtip || !journey) return;
    jtip.querySelector('.jtip__title').innerHTML = rect.getAttribute('data-title');
    jtip.querySelector('.jtip__body').innerHTML  = rect.getAttribute('data-info');
    jtip.hidden = false;

    /* a body-level overlay in viewport coordinates. It used to live inside
       the sticky pin, which is its own stacking context, so the next
       section painted straight over it. */
    var panel = journey.getBoundingClientRect();
    var hit   = rect.getBoundingClientRect();
    var w = jtip.offsetWidth, h = jtip.offsetHeight;
    var left = hit.left + hit.width / 2 - w / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - w - 12));

    var below = panel.bottom + 14;
    var top = (below + h > window.innerHeight - 12) ? panel.top - h - 14 : below;
    jtip.style.left = left + 'px';
    jtip.style.top  = Math.max(12, top) + 'px';
    void jtip.offsetWidth;
    jtip.classList.add('is-shown');
  }

  function hideTip() {
    if (!jtip) return;
    jtip.classList.remove('is-shown');
  }

  jhits.forEach(function (r) {
    r.addEventListener('mouseenter', function () { showTip(r); });
    r.addEventListener('mouseleave', hideTip);
    r.addEventListener('focus', function () { showTip(r); });
    r.addEventListener('blur', hideTip);
    r.addEventListener('click', function (e) {
      e.stopPropagation();
      if (jtip && jtip.classList.contains('is-shown')) hideTip(); else showTip(r);
    });
    r.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showTip(r); }
      if (e.key === 'Escape') hideTip();
    });
  });
  /* the tip is anchored to a diagram that moves under scroll */
  window.addEventListener('scroll', hideTip, { passive: true });

  /* =====================================================================
     GROUND SWITCH
     ===================================================================== */
  var groundBtns = [].slice.call(document.querySelectorAll('.themes__btn'));

  function setGround(name, remember) {
    if (name && name !== 'midnight') doc.setAttribute('data-theme', name);
    else { doc.removeAttribute('data-theme'); name = 'midnight'; }
    groundBtns.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.ground === name));
    });
    readStarColour();
    if (remember) { try { localStorage.setItem('ns-ground', name); } catch (e) {} }
  }

  groundBtns.forEach(function (b) {
    b.addEventListener('click', function () { setGround(b.dataset.ground, true); });
  });

  try {
    var saved = localStorage.getItem('ns-ground');
    if (saved) setGround(saved, false);
  } catch (e) { /* private mode; midnight stands */ }

  var yr = document.getElementById('year');
  if (yr) yr.textContent = new Date().getFullYear();
})();
