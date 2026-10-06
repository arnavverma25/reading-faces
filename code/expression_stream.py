"""
expression_stream.py - a small, readable expression reader for live video.

For every camera frame it runs the seven steps from Chapter 6 of the tutorial:
  1. find the face and its landmarks (MediaPipe Face Landmarker)
  2. measure the view: face size and head angles
  3. gate: skip faces that are too small or turned too far
  4. score five expressions by comparing the face with the person's resting face
  5. smooth the scores over time
  6. decide on a label, or "not sure"
  7. print a cue only when the label changes

Install:  pip install "mediapipe==1.0.0" opencv-python
          (mediapipe 1.0.1 crashes on macOS with "Service is unavailable")
Model:    download face_landmarker.task from the MediaPipe Face Landmarker page
          and keep it in the folder you run the program from
Run:      python expression_stream.py
Keys:     click the camera window first, then
          q or Esc = quit      r = measure the resting face again (for a new person)
          Ctrl+C in the Terminal also quits
"""
import math
import time

LABELS = ["neutral", "smiling", "surprised", "sad", "angry"]

# ---- settings to tune ---------------------------------------------------
WINDOW = 12            # smoothing window in frames (12 frames = 0.4 s at 30 fps)
THRESHOLD = 0.6        # how sure the average must be before a label is given
MIN_FACE_PIXELS = 100  # smaller faces are not classified
MAX_ANGLE = 60         # degrees; beyond this the face counts as turned away
GOOD_ANGLE = 30        # degrees; up to this the frame gets full trust
REST_FRAMES = 45       # frames used to measure the resting face (1.5 s at 30 fps)
LABEL_SIZE = 2.0       # size of the label written on the camera picture


def features(blend):
    """Reduce the 52 blendshape values (each 0 to 1) to the eight that the rules
    use. Left and right are averaged. Each one is close to an Action Unit."""
    def both(name):
        return (blend.get(name + "Left", 0.0) + blend.get(name + "Right", 0.0)) / 2

    brows = blend.get("browInnerUp", 0.0) + both("browOuterUp")
    lips = both("mouthPress") + blend.get("mouthRollLower", 0.0)
    return {
        "smile": both("mouthSmile"),                   # AU12 lip corner puller
        "frown": both("mouthFrown"),                   # AU15 lip corner depressor
        "jaw_open": blend.get("jawOpen", 0.0),         # AU26 jaw drop
        "brow_up": brows,                              # AU1 + AU2 brow raisers
        "brow_down": both("browDown"),                 # AU4 brow lowerer
        "eye_squint": both("eyeSquint"),               # AU7 lid tightener
        "lips_tight": lips,                            # AU24 lip pressor
        "chin_up": blend.get("mouthShrugLower", 0.0),  # AU17 chin raiser
    }


def expression_scores(face, rest):
    """Step 4. Compare a face with the same person's resting face and return
    five scores that add up to 1.

    Only the CHANGE from the resting face counts, so a person whose brows sit
    low is not called angry all the time. The divisors (0.8, 0.5, 0.45, 0.4,
    0.18) are how far each feature moved on one test face for a full
    expression. They are starting values, not trained.
    """
    def rise(x):                          # keep increases, ignore decreases
        return max(0.0, x)

    def clip(x):                          # keep a score between 0 and 1
        return min(1.0, max(0.0, x))

    d = {name: face[name] - rest[name] for name in face}     # change from rest

    brow_raise = d["brow_up"] + rise(-d["brow_down"])
    tension = (d["lips_tight"] + 0.5 * rise(d["eye_squint"])
               + 0.5 * rise(d["brow_down"]))

    smiling = clip(d["smile"] / 0.8)
    surprised = clip(0.6 * brow_raise / 0.5 + 0.4 * d["jaw_open"] / 0.45)
    angry = clip(tension / 0.4)
    sad = clip((d["chin_up"] + d["frown"] - 0.5 * d["lips_tight"]) / 0.18)
    neutral = 1.0 - max(smiling, surprised, sad, angry)

    scores = [neutral, smiling, surprised, sad, angry]
    squared = [s * s for s in scores]    # squaring makes the strongest score stand out
    total = sum(squared)
    return [s / total for s in squared]


class RestingFace:
    """Step 4, first part. Averages the first frames to learn what this
    person's face looks like at rest."""

    def __init__(self):
        self.sums = {}
        self.count = 0
        self.rest = None                  # the finished measurement; None while measuring

    def add(self, face):
        for name, value in face.items():
            self.sums[name] = self.sums.get(name, 0.0) + value
        self.count += 1
        if self.count == REST_FRAMES:
            self.rest = {name: total / REST_FRAMES for name, total in self.sums.items()}


def head_angles(matrix):
    """Step 2. Read yaw (turn left/right) and pitch (tilt up/down) in degrees
    from the 4x4 face transformation matrix."""
    forward = (matrix[0][2], matrix[1][2], matrix[2][2])   # where the nose points
    yaw = math.degrees(math.atan2(forward[0], forward[2]))
    pitch = math.degrees(math.atan2(-forward[1], math.hypot(forward[0], forward[2])))
    return yaw, pitch


def view_trust(face_pixels, yaw, pitch):
    """Step 3. Return 0 when the face should not be classified, otherwise a
    trust value between 0.3 and 1."""
    angle = max(abs(yaw), abs(pitch))
    if face_pixels < MIN_FACE_PIXELS or angle > MAX_ANGLE:
        return 0.0
    if angle <= GOOD_ANGLE:
        return 1.0
    return 1.0 - 0.7 * (angle - GOOD_ANGLE) / (MAX_ANGLE - GOOD_ANGLE)


class Smoother:
    """Steps 5 to 7. Keeps a running average and decides when to speak."""

    def __init__(self):
        self.average = [1.0 / len(LABELS)] * len(LABELS)   # start with no opinion
        self.label = "not sure"
        self.last_spoken = None

    def update(self, scores, trust):
        """Steps 5 and 6. Blend one frame into the average (a frame with low trust
        moves it less), then pick a label."""
        a = trust * 2.0 / (WINDOW + 1)
        self.average = [a * new + (1 - a) * old for new, old in zip(scores, self.average)]

        top = max(range(len(LABELS)), key=lambda i: self.average[i])
        # hysteresis: the current label may stay a little below the threshold
        needed = THRESHOLD - 0.1 if LABELS[top] == self.label else THRESHOLD
        self.label = LABELS[top] if self.average[top] >= needed else "not sure"
        return self.label

    def cue(self):
        """Step 7. Return a word to speak, or None. Speaks only for a new,
        non-neutral label."""
        if self.label == "neutral":
            self.last_spoken = None
        if self.label in ("neutral", "not sure") or self.label == self.last_spoken:
            return None
        self.last_spoken = self.label
        return self.label


def main():
    import cv2
    import mediapipe as mp

    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path="face_landmarker.task"),
        running_mode=mp.tasks.vision.RunningMode.VIDEO,
        num_faces=1,
        output_face_blendshapes=True,
        output_facial_transformation_matrixes=True)

    resting = RestingFace()
    smoother = Smoother()
    view = "ok"
    camera = cv2.VideoCapture(0)
    print("(to stop: click the camera window and press q, or press Ctrl+C here)")
    print("(keep a neutral face for two seconds)")

    try:
        with mp.tasks.vision.FaceLandmarker.create_from_options(options) as landmarker:
            while True:
                ok, frame = camera.read()
                if not ok:
                    break
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                result = landmarker.detect_for_video(image, int(time.monotonic() * 1000))

                # Step 1: is there a face at all?
                if not result.face_landmarks:
                    new_view = "no face"
                else:
                    # Steps 2 and 3: measure the view and gate
                    xs = [point.x for point in result.face_landmarks[0]]
                    face_pixels = (max(xs) - min(xs)) * frame.shape[1]
                    yaw, pitch = head_angles(result.facial_transformation_matrixes[0])
                    trust = view_trust(face_pixels, yaw, pitch)
                    new_view = "ok" if trust > 0 else "cannot see the face well"

                    if trust > 0:
                        blend = {c.category_name: c.score for c in result.face_blendshapes[0]}
                        face = features(blend)
                        if resting.rest is None:
                            # Step 4, first part: learn the resting face
                            resting.add(face)
                            if resting.rest is not None:
                                print("(ready)")
                        else:
                            # Steps 4 to 7: score, smooth, decide, speak
                            smoother.update(expression_scores(face, resting.rest), trust)
                            word = smoother.cue()
                            if word:
                                print(word)          # on a phone: play a sound or vibrate

                if new_view != view:             # report view problems once, not every frame
                    view = new_view
                    if view != "ok":
                        print("(" + view + ")")

                # show the camera picture, mirrored, with the current state written on it
                if view != "ok":
                    shown = view
                elif resting.rest is None:
                    shown = "measuring the resting face"
                else:
                    shown = smoother.label
                picture = cv2.flip(frame, 1)
                place = (20, int(40 * LABEL_SIZE))
                font = cv2.FONT_HERSHEY_SIMPLEX
                cv2.putText(picture, shown, place, font, LABEL_SIZE, (0, 0, 0), 10)        # dark outline
                cv2.putText(picture, shown, place, font, LABEL_SIZE, (255, 255, 255), 4)  # white text
                cv2.imshow("camera", picture)

                key = cv2.waitKey(1) & 0xFF
                if key in (ord("q"), ord("Q"), 27):       # q or Esc
                    break
                if key in (ord("r"), ord("R")):          # a new person sat down: start again
                    resting = RestingFace()
                    smoother = Smoother()
                    print("(keep a neutral face for two seconds)")
    except KeyboardInterrupt:
        pass                      # Ctrl+C in the Terminal also stops the program

    camera.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
