#!/usr/bin/env bash
# Usage: batch.sh  -- renders muse loops for every scene x time not yet present, one at a time.
. "$(dirname "$0")/scenes.sh"
R=/Users/tttnguyen/dev/somewhere-a-little-peace; T=$HOME/dev/tmp/peace-video; LOG=$T/batch.log
for time in day dusk night; do for scene in tearoom livingroom bedroom greenhouse sunset; do
  out=$R/assets/art/$scene-$time.mp4; [ -f "$out" ] && continue
  m=motion_$scene; l=light_$time
  cat > $T/$scene-$time.txt <<P
NEW STANDALONE REQUEST. Ignore any earlier versions, drafts, images or projects. Use ONLY the image attached to this message as the first frame. Generate one new video from scratch and return the finished video file in this reply.

A quiet living painting, ${!l}. Keep the attached hand-painted gouache and watercolour film-background style exactly, soft painterly edges, no outlines added.

CAMERA: completely locked off, static tripod shot, no pan, no zoom, no drift. The framing never changes.

WHAT MOVES, gently and slowly for the whole clip: ${!m}
No people appear or enter. The last second returns to the same calm state as the first frame so the clip can loop.
Sound: only soft ambience.
P
  echo "$(date +%T) start $scene-$time" >> $LOG
  STYLE=animation SIZE=16:9 DURATION=6 IMAGE=$R/assets/art/$scene-$time.jpg OUT_NAME=$scene-$time-raw.mp4 NO_OPEN=1 MUSEAI_HOME=$HOME/dev/museai-main \
    $HOME/dev/museai-main/.claude/skills/muse-video/scripts/muse-video -f $T/$scene-$time.txt $T >> $LOG 2>&1
  [ -f $T/$scene-$time-raw.mp4 ] || { echo "$(date +%T) FAIL $scene-$time" >> $LOG; continue; }
  ffmpeg -v error -y -i $T/$scene-$time-raw.mp4 -filter_complex "[0:v]trim=1:5,setpts=PTS-STARTPTS[body];[0:v]trim=5:6,setpts=PTS-STARTPTS[tail];[0:v]trim=0:1,setpts=PTS-STARTPTS[head];[tail][head]xfade=transition=fade:duration=1:offset=0[x];[body][x]concat=n=2:v=1,scale=1280:720[v]" -map "[v]" -an -c:v libx264 -crf 27 -pix_fmt yuv420p -movflags +faststart "$out" && echo "$(date +%T) done $scene-$time" >> $LOG
done; done
echo "$(date +%T) ALL DONE" >> $LOG
