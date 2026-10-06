/* Conversation simulator - the page part: sliders, drawing and playback.
   The maths lives in sim-core.js. */

(function () {
  if (!document.getElementById("sim")) return;

  var COLORS = { neutral: "#c3ccd6", happy: "#eda100", surprised: "#0071ce", sad: "#4a3aa7", angry: "#e34948" };
  var TEXT = { neutral: "#101820", happy: "#101820", surprised: "#ffffff", sad: "#ffffff", angry: "#ffffff" };
  var SAYS = { happy: "smiling", surprised: "looks surprised", sad: "looks sad", angry: "looks angry" };

  var PRESETS = {
    lab:        { window: 12, threshold: 60, yaw: 0,  mask: false, sunglasses: false, light: false },
    raw:        { window: 1,  threshold: 60, yaw: 0,  mask: false, sunglasses: false, light: false },
    mask:       { window: 12, threshold: 60, yaw: 0,  mask: true,  sunglasses: false, light: false },
    sunglasses: { window: 12, threshold: 60, yaw: 0,  mask: false, sunglasses: true,  light: false },
    side:       { window: 12, threshold: 60, yaw: 45, mask: false, sunglasses: false, light: false },
    all:        { window: 12, threshold: 60, yaw: 40, mask: true,  sunglasses: true,  light: true }
  };

  function el(id) { return document.getElementById(id); }
  var input = { window: el("s-window"), threshold: el("s-threshold"), yaw: el("s-yaw"),
                mask: el("s-mask"), sunglasses: el("s-sunglasses"), light: el("s-light") };
  var canvases = { truth: el("c-truth"), raw: el("c-raw"), out: el("c-out") };

  var result = null;      // the latest simulation run
  var frame = 0;          // playhead position, 0 to Sim.FRAMES - 1
  var playing = false;
  var startTime = 0;
  var hatch = null;

  // ---- reading the controls ------------------------------------------------
  function settings() {
    return {
      window: Number(input.window.value),
      threshold: Number(input.threshold.value) / 100,
      cond: { yaw: Number(input.yaw.value), mask: input.mask.checked,
              sunglasses: input.sunglasses.checked, lowLight: input.light.checked }
    };
  }

  function recompute() {
    var s = settings();
    result = Sim.run(s.cond, s.window, s.threshold);

    el("o-window").textContent = s.window === 1 ? "off" : s.window + " frames (" + (s.window / Sim.FPS).toFixed(2) + " s)";
    el("o-threshold").textContent = Math.round(s.threshold * 100) + "%";
    el("o-yaw").textContent = s.cond.yaw + "°";

    var st = result.stats;
    el("st-acc").textContent = Math.round(st.frameAccuracy * 100) + "%";
    el("st-caught").textContent = st.caught + " of " + st.events;
    el("st-wrong").textContent = st.wrongCues;
    el("st-delay").textContent = st.meanDelay === null ? "none" : st.meanDelay.toFixed(1) + " s";
    el("sim-summary").textContent = "With these settings the device stays quiet for " +
      Math.round(st.quietShare * 100) + "% of the 20 seconds.";
    draw();
  }

  // ---- drawing the three strips ---------------------------------------------
  function hatchPattern(ctx) {
    if (hatch) return hatch;
    var tile = document.createElement("canvas");
    tile.width = 8; tile.height = 8;
    var t = tile.getContext("2d");
    t.fillStyle = "#ffffff"; t.fillRect(0, 0, 8, 8);
    t.strokeStyle = "#5f6c7a"; t.lineWidth = 1.5;
    t.beginPath(); t.moveTo(0, 8); t.lineTo(8, 0); t.moveTo(-2, 2); t.lineTo(2, -2); t.moveTo(6, 10); t.lineTo(10, 6); t.stroke();
    hatch = ctx.createPattern(tile, "repeat");
    return hatch;
  }

  function drawStrip(canvas, labels, cues) {
    var ratio = window.devicePixelRatio || 1;
    var width = canvas.clientWidth, stripHeight = 30;
    var height = cues ? 46 : 30;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, width, height);

    var perFrame = width / labels.length;
    var i = 0;
    ctx.font = "600 12px Manrope, Inter, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    while (i < labels.length) {
      var j = i;
      while (j < labels.length && labels[j] === labels[i]) j++;
      var x = i * perFrame, w = (j - i) * perFrame;
      ctx.fillStyle = COLORS[labels[i]] || hatchPattern(ctx);
      ctx.fillRect(x, 0, w + 0.5, stripHeight);
      if (cues !== false && COLORS[labels[i]] && w > ctx.measureText(labels[i]).width + 10) {
        ctx.fillStyle = TEXT[labels[i]];
        ctx.fillText(labels[i], x + w / 2, stripHeight / 2 + 1);
      }
      i = j;
    }
    ctx.strokeStyle = "#cfd5dc"; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, stripHeight - 1);

    if (cues) {
      for (var c = 0; c < cues.length; c++) {
        var cx = cues[c].frame * perFrame;
        if (cues[c].correct) {
          ctx.fillStyle = "#101820";
          ctx.beginPath(); ctx.moveTo(cx, 33); ctx.lineTo(cx - 5, 43); ctx.lineTo(cx + 5, 43); ctx.closePath(); ctx.fill();
        } else {
          ctx.strokeStyle = "#c2410c"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(cx - 4, 34); ctx.lineTo(cx + 4, 42); ctx.moveTo(cx + 4, 34); ctx.lineTo(cx - 4, 42); ctx.stroke();
        }
      }
    }
    // playhead
    var px = (frame + 0.5) * perFrame;
    ctx.strokeStyle = "#101820"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, stripHeight); ctx.stroke();
  }

  function draw() {
    if (!result) return;
    drawStrip(canvases.truth, result.truth, null);
    drawStrip(canvases.raw, result.raw, false);      // false = no text labels, the runs are too short
    drawStrip(canvases.out, result.output, result.cues);
    drawFace();
    say();
  }

  // ---- the face drawing -----------------------------------------------------
  function drawFace() {
    var s = settings().cond;
    var truth = Sim.truthAt(frame);
    var k = truth.label === "neutral" ? 0 : truth.strength;   // how strong the expression is right now
    var browOuter = -24, browInner = -24, eye = 4.2, mouth = "M-13 24 L13 24";

    if (truth.label === "happy") {
      mouth = "M-17 " + (23 - 2 * k) + " Q0 " + (23 + 15 * k) + " 17 " + (23 - 2 * k);
    } else if (truth.label === "sad") {
      browOuter = -24 + 3 * k; browInner = -24 - 5 * k;
      mouth = "M-15 " + (23 + 5 * k) + " Q0 " + (23 - 7 * k) + " 15 " + (23 + 5 * k);
    } else if (truth.label === "surprised") {
      browOuter = browInner = -24 - 7 * k; eye = 4.2 + 2 * k;
      var ry = 1 + 9 * k;
      mouth = "M-7 26 a7 " + ry + " 0 1 0 14 0 a7 " + ry + " 0 1 0 -14 0";
    } else if (truth.label === "angry") {
      browOuter = -24 - 4 * k; browInner = -24 + 5 * k;
      mouth = "M-12 " + (24 + 3 * k) + " L0 24 L12 " + (24 + 3 * k);
    }
    el("f-browL").setAttribute("y1", browOuter); el("f-browL").setAttribute("y2", browInner);
    el("f-browR").setAttribute("y1", browOuter); el("f-browR").setAttribute("y2", browInner);
    el("f-eyeL").setAttribute("r", eye); el("f-eyeR").setAttribute("r", eye);
    el("f-mouth").setAttribute("d", mouth);

    // turned head: squeeze the features to one side and shade the far half
    var turn = s.yaw / 90;
    el("f-features").setAttribute("transform", "translate(" + (23.5 * turn) + ",0) scale(" + (1 - 0.62 * turn) + ",1)");
    var shade = el("f-shade");
    if (turn > 0.2) {
      var bx = (-0.8 + 0.8 * Math.min(1, (turn - 0.2) / 0.8)) * 55;
      var yi = 56 * Math.sqrt(Math.max(0, 1 - Math.pow(bx / 44, 2)));
      shade.setAttribute("d", "M" + bx + " " + (-yi) + " A44 56 0 0 0 " + bx + " " + yi + " Z");
      shade.style.display = "";
    } else {
      shade.style.display = "none";
    }
    el("f-mask").style.display = s.mask ? "" : "none";
    el("f-sunglasses").style.display = s.sunglasses ? "" : "none";
    el("f-dark").style.display = s.lowLight ? "" : "none";
  }

  function say() {
    var state = result.output[frame];
    var box = el("sim-say");
    var time = (frame / Sim.FPS).toFixed(1) + " s";
    if (state === "turned") box.innerHTML = "Device: quiet<small>face turned away, " + time + "</small>";
    else if (state === "unsure") box.innerHTML = "Device: quiet<small>not sure, " + time + "</small>";
    else if (state === "neutral") box.innerHTML = "Device: quiet<small>neutral face, " + time + "</small>";
    else box.innerHTML = "Device: &ldquo;" + SAYS[state] + "&rdquo;<small>" + time + "</small>";
  }

  // ---- playback ----------------------------------------------------------------
  function tick(now) {
    if (!playing) return;
    frame = Math.floor((now - startTime) / 1000 * Sim.FPS);
    if (frame >= Sim.FRAMES) { frame = Sim.FRAMES - 1; stop(); }
    draw();
    if (playing) requestAnimationFrame(tick);
  }
  function play() {
    if (frame >= Sim.FRAMES - 1) frame = 0;
    playing = true;
    startTime = performance.now() - frame / Sim.FPS * 1000;
    el("sim-play").textContent = "Pause";
    el("sim-say").setAttribute("aria-live", "off");     // do not flood screen readers during playback
    requestAnimationFrame(tick);
  }
  function stop() {
    playing = false;
    el("sim-play").textContent = "Play";
    el("sim-say").setAttribute("aria-live", "polite");
  }

  // ---- wiring ------------------------------------------------------------------
  el("sim-play").addEventListener("click", function () { if (playing) stop(); else play(); });
  el("sim-reset").addEventListener("click", function () { stop(); frame = 0; draw(); });

  Object.keys(input).forEach(function (name) {
    input[name].addEventListener("input", recompute);
  });

  document.querySelectorAll("[data-preset]").forEach(function (button) {
    button.addEventListener("click", function () {
      var p = PRESETS[button.getAttribute("data-preset")];
      input.window.value = p.window; input.threshold.value = p.threshold; input.yaw.value = p.yaw;
      input.mask.checked = p.mask; input.sunglasses.checked = p.sunglasses; input.light.checked = p.light;
      recompute();
    });
  });

  Object.keys(canvases).forEach(function (name) {
    canvases[name].addEventListener("click", function (event) {
      var box = canvases[name].getBoundingClientRect();
      stop();
      frame = Math.max(0, Math.min(Sim.FRAMES - 1, Math.floor((event.clientX - box.left) / box.width * Sim.FRAMES)));
      draw();
    });
  });

  window.addEventListener("resize", draw);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
  recompute();
})();
