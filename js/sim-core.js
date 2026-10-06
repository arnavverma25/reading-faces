/* ------------------------------------------------------------
   Conversation simulator - the maths only (no drawing here).

   It imitates what Chapters 4 to 6 describe:
     1. a noisy classifier that looks at one frame at a time,
     2. smoothing over time,
     3. a rule for when to stay quiet.

   The noise model is invented for teaching. It is not real data.
   ------------------------------------------------------------ */

var Sim = (function () {

  var FPS = 30;
  var SECONDS = 20;
  var FRAMES = FPS * SECONDS;
  var CLASSES = ["neutral", "happy", "surprised", "sad", "angry"];
  var GAIN = 5;   // how sharply the classifier turns evidence into probabilities

  // What the conversation partner really does: [start second, end second, expression]
  var SCRIPT = [
    [0, 3, "neutral"],
    [3, 6.5, "happy"],
    [6.5, 8.5, "neutral"],
    [8.5, 11.5, "surprised"],
    [11.5, 13, "neutral"],
    [13, 16, "sad"],
    [16, 17.5, "neutral"],
    [17.5, 20, "angry"]
  ];

  // How much of each expression is still visible when part of the face is covered.
  // 1 = fully visible, 0 = invisible. Mouth-based expressions suffer under a mask,
  // eye-and-brow-based expressions suffer under sunglasses.
  var VISIBLE = {
    mask:       { neutral: 1, happy: 0.50, surprised: 0.75, sad: 0.45, angry: 0.95 },
    sunglasses: { neutral: 1, happy: 0.95, surprised: 0.50, sad: 0.75, angry: 0.55 }
  };

  // A small random number generator with a fixed seed, so every visitor sees the same run.
  function makeRandom(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Bell-shaped noise for every frame and class, made once.
  var NOISE = (function () {
    var random = makeRandom(663);
    var table = [];
    for (var f = 0; f < FRAMES; f++) {
      var row = [];
      for (var c = 0; c < CLASSES.length; c++) {
        var u = Math.max(random(), 1e-9), v = random();
        row.push(Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
      }
      table.push(row);
    }
    return table;
  })();

  // The true expression at one frame: its label and how strong it is (0 to 1).
  // An expression fades in and fades out over 0.4 seconds (onset and offset).
  function truthAt(frame) {
    var t = frame / FPS;
    for (var i = 0; i < SCRIPT.length; i++) {
      var s = SCRIPT[i];
      if (t >= s[0] && t < s[1]) {
        if (s[2] === "neutral") return { label: "neutral", strength: 1, segment: i };
        var ramp = 0.4;
        var fadeOut = (i === SCRIPT.length - 1) ? 1 : (s[1] - t) / ramp;
        var strength = Math.max(0, Math.min(1, (t - s[0]) / ramp, fadeOut));
        return { label: s[2], strength: strength, segment: i };
      }
    }
    return { label: "neutral", strength: 1, segment: SCRIPT.length - 1 };
  }

  // How much a turned head reduces what the camera can see.
  function angleFactor(yaw) {
    if (yaw <= 20) return 1;
    if (yaw >= 80) return 0.2;
    return 1 - 0.8 * (yaw - 20) / 60;
  }

  // Step 1: the noisy per-frame classifier. Returns five probabilities.
  function classifyFrame(frame, cond) {
    var truth = truthAt(frame);
    var seen = truth.strength * angleFactor(cond.yaw) * (cond.lowLight ? 0.75 : 1);
    if (cond.mask) seen *= VISIBLE.mask[truth.label];
    if (cond.sunglasses) seen *= VISIBLE.sunglasses[truth.label];

    var noise = 0.35 * (1 + 0.8 * Math.min(cond.yaw / 60, 1.5)
                          + (cond.lowLight ? 0.6 : 0)
                          + (cond.mask ? 0.15 : 0)
                          + (cond.sunglasses ? 0.15 : 0));

    var scores = [], total = 0;
    for (var c = 0; c < CLASSES.length; c++) {
      var evidence = 0.15;
      if (truth.label === "neutral") {
        if (CLASSES[c] === "neutral") evidence = 1.0;
      } else {
        if (CLASSES[c] === truth.label) evidence = 1.2 * seen;
        if (CLASSES[c] === "neutral") evidence = 1.1 * (1 - seen);
      }
      var value = Math.exp(GAIN * (evidence + noise * NOISE[frame][c]));
      scores.push(value);
      total += value;
    }
    return scores.map(function (v) { return v / total; });
  }

  function best(probabilities) {
    var top = 0;
    for (var c = 1; c < probabilities.length; c++) if (probabilities[c] > probabilities[top]) top = c;
    return top;
  }

  // Run the whole 20-second conversation.
  //   cond  = { mask, sunglasses, lowLight, yaw }
  //   windowFrames = smoothing window (1 = no smoothing)
  //   threshold    = how sure the device must be before it speaks
  function run(cond, windowFrames, threshold) {
    var alpha = 2 / (windowFrames + 1);          // weight of the newest frame
    var smooth = [0.2, 0.2, 0.2, 0.2, 0.2];   // start with no opinion
    var state = "unsure";                         // what the device currently believes
    var truth = [], raw = [], output = [], cues = [];
    var lastSpoken = null;

    for (var f = 0; f < FRAMES; f++) {
      var tr = truthAt(f);
      truth.push(tr.strength >= 0.5 ? tr.label : "neutral");

      var p = classifyFrame(f, cond);
      raw.push(CLASSES[best(p)]);

      // Step 2: smoothing. Blend the new frame into the running average.
      for (var c = 0; c < p.length; c++) smooth[c] = alpha * p[c] + (1 - alpha) * smooth[c];

      // Step 3: decide. Stay quiet when the face is turned away or the answer is not clear.
      if (cond.yaw > 60) {
        state = "turned";
      } else {
        var top = best(smooth), sure = smooth[top];
        var keep = (CLASSES[top] === state) ? threshold - 0.1 : threshold;   // hysteresis
        state = (sure >= keep) ? CLASSES[top] : "unsure";
      }
      output.push(state);

      // The device speaks only when it settles on a new, non-neutral expression.
      if (state === "neutral") lastSpoken = null;
      if (state !== "neutral" && state !== "unsure" && state !== "turned" && state !== lastSpoken) {
        var grace = Math.max(0, f - Math.round(0.5 * FPS));   // allow half a second of lag
        var correct = (tr.label === state) || (truthAt(grace).label === state);
        cues.push({ frame: f, label: state, correct: correct, segment: tr.label === state ? tr.segment : truthAt(grace).segment });
        lastSpoken = state;
      }
    }

    // Score the run.
    var rawRight = 0, quiet = 0;
    for (var i = 0; i < FRAMES; i++) {
      if (raw[i] === truth[i]) rawRight++;
      if (output[i] === "unsure" || output[i] === "turned") quiet++;
    }
    var events = 0, caught = 0, delaySum = 0, wrong = 0;
    for (var s = 0; s < SCRIPT.length; s++) {
      if (SCRIPT[s][2] === "neutral") continue;
      events++;
      for (var k = 0; k < cues.length; k++) {
        if (cues[k].correct && cues[k].segment === s) {
          caught++;
          delaySum += cues[k].frame / FPS - SCRIPT[s][0];
          break;
        }
      }
    }
    for (var w = 0; w < cues.length; w++) if (!cues[w].correct) wrong++;

    return {
      truth: truth, raw: raw, output: output, cues: cues,
      stats: {
        frameAccuracy: rawRight / FRAMES,
        events: events,
        caught: caught,
        missed: events - caught,
        wrongCues: wrong,
        meanDelay: caught ? delaySum / caught : null,
        quietShare: quiet / FRAMES
      }
    };
  }

  return { FPS: FPS, SECONDS: SECONDS, FRAMES: FRAMES, CLASSES: CLASSES, SCRIPT: SCRIPT, truthAt: truthAt, run: run };
})();

if (typeof module !== "undefined") module.exports = Sim;   // lets the same file be tested outside the browser
