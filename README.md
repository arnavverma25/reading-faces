# Reading Faces

A research tutorial for CS 663 Computer Vision by Arnav Verma.

Topic: previous work on reading facial expressions with a phone or smart glasses, to help people who are blind or have low vision. The tutorial focuses on the hard cases: live video, changing expressions, covered faces and side views.

## What is in this folder

| File or folder | What it is |
| --- | --- |
| `index.html` | Home page with the table of contents |
| `problem.html` to `future.html` | The nine chapters |
| `try.html` | The interactive simulator and the quiz |
| `references.html` | The annotated bibliography |
| `css/style.css` | One stylesheet for every page |
| `js/site.js` | Mobile menu and the narration bar |
| `js/sim-core.js`, `js/sim.js` | The simulator: the maths, then the drawing |
| `js/quiz.js` | The quiz questions and feedback |
| `code/expression_stream.py` | The Python program from Chapter 6 |
| `audio/` | Narration recordings (see `audio/README.txt`) |

The site is plain HTML, CSS and JavaScript. There is nothing to build or install.

## Put it online with GitHub Pages

1. Create a new public repository on GitHub, for example `reading-faces`.
2. Upload everything in this folder to the repository, so that `index.html` is at the top level.
3. In the repository, open **Settings**, then **Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**, pick the `main` branch and the `/ (root)` folder, and save.
5. After a minute or two the site is live at `https://YOUR-USERNAME.github.io/reading-faces/`.

## Add the narration

Record one MP3 or M4A file for each page and put it in `audio/` with the names listed in `audio/README.txt`. The text to read is on each page under "Read the narration text".

## Run the Python program

```
pip install "mediapipe==1.0.0" opencv-python
```

Use this exact MediaPipe version on a Mac. Version 1.0.1 crashes there with the message "Service is unavailable".

Download `face_landmarker.task` from the MediaPipe Face Landmarker page
(https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) and keep it in the folder you run the program from. Then:

```
python expression_stream.py
```

Keep a neutral face for the first two seconds while the program measures your resting face. In the camera window, press `r` to measure again for a new person and `q` to stop. The numbers in the scoring rules were tuned on one face; adjust them if another face is read badly.

## Changing the text

Each page is a normal HTML file. If you add or remove a reference, keep the numbers in order of first appearance and update `references.html` to match.
