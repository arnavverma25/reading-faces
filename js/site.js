/* Used on every page: the mobile menu and the narration bar. */

// 1. Mobile menu: the Menu button shows and hides the list of chapters.
var menuButton = document.querySelector(".menu-btn");
if (menuButton) {
  menuButton.addEventListener("click", function () {
    var open = document.body.classList.toggle("menu-open");
    menuButton.setAttribute("aria-expanded", open ? "true" : "false");
    menuButton.textContent = open ? "Close" : "Menu";
  });
}

// 2. Narration: play the recording (an MP3 or M4A file in the audio folder).
//    If neither file exists, offer the browser's own voice instead, reading
//    the narration text on the page.
var bar = document.querySelector(".narration");
if (bar) {
  var player = bar.querySelector("audio");
  var speakButton = bar.querySelector(".speak");
  var transcript = bar.querySelector(".transcript");

  // The player starts hidden, so nothing flashes while the browser looks for a recording.
  function showPlayer() {
    player.hidden = false;
  }
  function useBrowserVoice() {
    player.hidden = true;
    if ("speechSynthesis" in window) speakButton.hidden = false;
  }
  player.addEventListener("loadedmetadata", showPlayer);     // a recording was found
  if (player.readyState >= 1) showPlayer();                  // it had already loaded
  // The browser tries the MP3, then the M4A. When the last one fails, no recording exists.
  var files = player.querySelectorAll("source");
  files[files.length - 1].addEventListener("error", useBrowserVoice);
  if (player.networkState === 3) useBrowserVoice();   // both had already failed before this script ran

  speakButton.addEventListener("click", function () {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      speakButton.textContent = "Play narration";
      return;
    }
    var speech = new SpeechSynthesisUtterance(transcript.textContent);
    speech.rate = 0.95;
    speech.onend = function () { speakButton.textContent = "Play narration"; };
    window.speechSynthesis.speak(speech);
    speakButton.textContent = "Stop narration";
  });

  // stop the browser voice when the visitor leaves the page
  window.addEventListener("pagehide", function () {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  });
}
