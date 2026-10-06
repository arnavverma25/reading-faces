/* The quiz: eight questions with instant feedback. No answers are sent anywhere. */

(function () {
  var holder = document.getElementById("quiz");
  if (!holder) return;

  var QUESTIONS = [
    { q: "Why is testing on one clear, front-facing photo not enough for this application?",
      options: ["Photos are too large for a phone to process",
                "A real conversation is video, and faces are often covered or turned",
                "Front-facing photos cannot show a smile"],
      answer: 1,
      why: "The easy case leaves out time, covers and head angle, which are exactly what a worn camera meets. See Chapter 1." },
    { q: "A phone films at 30 frames per second. About how many frames does a 0.2 second micro-expression cover?",
      options: ["6", "60", "200"],
      answer: 0,
      why: "0.2 s × 30 frames per second = 6 frames. Research datasets use cameras with up to 200 frames per second. See Chapters 2 and 4." },
    { q: "Which cover hides Action Unit 12, the lip corner puller that makes a smile?",
      options: ["Sunglasses", "A fringe over the forehead", "A face mask"],
      answer: 2,
      why: "AU12 is on the lower face, so a mask hides it. Sunglasses hide upper-face units instead. See Chapters 3 and 5." },
    { q: "You make the smoothing window longer. What do you gain and what do you pay?",
      options: ["Fewer wrong cues, but a longer delay",
                "A shorter delay, but more wrong cues",
                "Higher accuracy in every frame, at no cost"],
      answer: 0,
      why: "Averaging over more frames removes flicker, but the device needs longer to notice a real change. Try it in the simulator above." },
    { q: "A video model is very bad at a rare expression such as disgust. Which score shows this more clearly?",
      options: ["WAR, the accuracy over all clips", "UAR, the average of the per-class accuracies", "Both show it equally"],
      answer: 1,
      why: "In UAR every class counts the same, so one weak class pulls the score down. In WAR a rare class hardly matters. See Chapter 4." },
    { q: "The partner's head is turned about 80 degrees away from the camera. What should the device do?",
      options: ["Report the most likely expression anyway",
                "Stay quiet and, if it lasts, tell the user the face is turned away",
                "Switch to micro-expression mode"],
      answer: 1,
      why: "Half the face is out of view. A wrong cue is worse than no cue, because the user cannot check the picture. See Chapter 5." },
    { q: "The partner wears a mask. What does a typical landmark model do with the mouth landmarks?",
      options: ["It leaves them out", "It marks them as hidden", "It still outputs them, as a guess"],
      answer: 2,
      why: "The model returns all of its points whether or not they are visible, so noticing a cover needs a separate check. See Chapter 5." },
    { q: "Why should the cue mean “smiling” and not “happy”?",
      options: ["Because “smiling” is a shorter word",
                "Because the camera sees a face movement, not a feeling",
                "Because happiness cannot be shown on a face"],
      answer: 1,
      why: "The same feeling is shown in many ways and the same face can mean different things. The device describes; the user interprets. See Chapter 8." }
  ];

  var answered = 0, right = 0;

  function build() {
    holder.innerHTML = "";
    answered = 0; right = 0;

    QUESTIONS.forEach(function (item, number) {
      var card = document.createElement("div");
      card.className = "q";
      card.setAttribute("role", "group");
      card.setAttribute("aria-labelledby", "q" + number + "-title");
      card.innerHTML = '<h3 id="q' + number + '-title">' + (number + 1) + ". " + item.q + "</h3>";

      var list = document.createElement("div");
      list.className = "opts";
      item.options.forEach(function (text, index) {
        var label = document.createElement("label");
        label.innerHTML = '<input type="radio" name="q' + number + '" value="' + index + '"><span>' + text + "</span>";
        label.querySelector("input").addEventListener("change", function () { check(card, item, index); });
        list.appendChild(label);
      });
      card.appendChild(list);

      var why = document.createElement("p");
      why.className = "why";
      why.setAttribute("role", "status");
      card.appendChild(why);
      holder.appendChild(card);
    });

    var score = document.createElement("div");
    score.className = "score";
    score.innerHTML = '<span id="quiz-score" role="status">Answered 0 of ' + QUESTIONS.length + '</span><button type="button">Start again</button>';
    score.querySelector("button").addEventListener("click", function () {
      build();
      document.getElementById("quiz-title").scrollIntoView();
    });
    holder.appendChild(score);
  }

  function check(card, item, chosen) {
    if (card.classList.contains("done")) return;      // only the first answer counts
    card.classList.add("done");
    var labels = card.querySelectorAll(".opts label");
    labels.forEach(function (label, index) {
      label.querySelector("input").disabled = true;
      if (index === item.answer) label.classList.add("right");
      if (index === chosen && chosen !== item.answer) label.classList.add("wrong");
    });
    var correct = chosen === item.answer;
    card.querySelector(".why").innerHTML = "<strong>" + (correct ? "Correct." : "Not quite.") + "</strong> " + item.why;
    answered++;
    if (correct) right++;
    var text = "Answered " + answered + " of " + QUESTIONS.length + ", " + right + " correct";
    if (answered === QUESTIONS.length) text = "Finished: " + right + " of " + QUESTIONS.length + " correct";
    document.getElementById("quiz-score").textContent = text;
  }

  build();
})();
